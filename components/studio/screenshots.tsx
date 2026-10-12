"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { batchDates, screenshotError, type FileRequest, type Screenshot } from '@/lib/studio/files';
import { dayLabel, torontoDate, type Channel, type ContentType, type Item, type Snapshot } from '@/lib/studio/types';
import { timeLabel } from '@/lib/studio/calendar';

type Queued = { id:string; file:File; title:string; contentType:ContentType; status:'waiting'|'uploading'|'done'|'error'; error?:string; saved?:Screenshot };
const message = (error:unknown) => error instanceof Error ? error.message : 'Could not save. Please retry.';
export function ScreenshotUpload({ data, channel, item, actorId, request, onSaved, onBusy }: {data:Snapshot;channel:Channel;item?:Item;actorId:string;request:FileRequest;onSaved:()=>void;onBusy:(busy:boolean)=>void}) {
  const [queue,setQueue]=useState<Queued[]>([]);
  const [start,setStart]=useState(torontoDate);
  const [uploadAs,setUploadAs]=useState<'separate'|'one_video'>('separate');
  const [videoType,setVideoType]=useState<ContentType>('internet_post');
  const [videoTitle,setVideoTitle]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const running=useRef(false);
  const grouped=!item && uploadAs==='one_video';
  const groupSaved=grouped?queue.find(row=>row.saved)?.saved:undefined;
  const started=queue.some(q=>q.status!=='waiting');
  // Keep previews correct while the shared snapshot catches up with a saved row.
  const knownItems=new Set(data.items.map(i=>i.id));
  const savedItems: Item[]=queue.flatMap(row => {
    const saved=row.saved;
    if(!saved?.due_date || knownItems.has(saved.item_id))return [];
    knownItems.add(saved.item_id);
    return [{id:saved.item_id,channel_id:channel.id,due_date:saved.due_date,upload_time:saved.upload_time,
      content_type:saved.content_type ?? row.contentType,title:row.title,link:'',notes:'',submitted_by:actorId,created_at:saved.created_at,version:1}];
  });
  const waiting=queue.filter(q=>q.status==='waiting');
  const types=grouped ? (!started && queue.length ? [videoType] : []) : waiting.map(q=>q.contentType);
  const dates=item?[]:batchDates({...data,items:[...data.items,...savedItems]},channel,types,start);
  const hasMissingDate=!item && dates.some(date=>!date);
  const done=queue.filter(q=>q.status==='done').length;

  function choose(files:FileList|null) {
    if(!files)return;
    if(files.length>20){setError('Choose up to 20 screenshots in one batch.');return;}
    const next=Array.from(files);
    const invalid=next.find(f=>screenshotError(f));
    if(invalid){setError(`${invalid.name}: ${screenshotError(invalid)}`);return;}
    setError('');
    setVideoTitle(next[0]?.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ') || '');
    setQueue(next.map(file=>({id:crypto.randomUUID(),file,title:file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '),contentType:item?.content_type ?? 'internet_post',status:'waiting'})));
  }
  async function upload() {
    if(running.current || !actorId || hasMissingDate)return;
    running.current=true;setBusy(true);onBusy(true);setError('');
    // The first successful file creates the video; every remaining file uses its
    // item ID, including after a paused upload resumes.
    let sharedItemId=item?.id || groupSaved?.item_id;
    try {
      for(const row of queue.filter(q=>q.status!=='done')) {
        setQueue(list=>list.map(q=>q.id===row.id?{...q,status:'uploading',error:undefined}:q));
        const form=new FormData();form.set('file',row.file);form.set('id',row.id);form.set('actor_id',actorId);
        if(sharedItemId)form.set('item_id',sharedItemId);
        else {
          const contentType=grouped?videoType:row.contentType;
          form.set('channel_id',channel.id);form.set('start_date',start);
          form.set('content_type',contentType);
          form.set('title',(grouped?videoTitle:row.title) || (contentType==='comic'?'Comic screenshot':'Internet post screenshot'));
        }
        try {
          const result=await request(form);
          if(grouped)sharedItemId=result.attachment.item_id;
          setQueue(list=>list.map(q=>q.id===row.id?{...q,status:'done',saved:result.attachment}:q));
          onSaved();
        } catch(err) {
          setQueue(list=>list.map(q=>q.id===row.id?{...q,status:'error',error:message(err)}:q));
          setError('Batch paused at this file. Finished uploads are saved; an interrupted file may have a reserved draft. Retry to continue in the same order.');
          break;
        }
      }
    } finally {running.current=false;setBusy(false);onBusy(false);}
  }
  function move(index:number,direction:number){setQueue(rows=>{const next=[...rows];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;});}
  let waitingIndex=0;
  return <section className="screenshot-uploader">
    <h3>{item?'Add screenshots':'Upload comics and internet posts'}</h3>
    <p>{item?'Add one or several screenshots to this submission.':grouped?'All selected screenshots belong to one video, with one title, type and date.':'Each screenshot creates a separate video. Choose Comic or Internet post for each file and fill the next open slots.'} Originals are kept at full resolution.</p>
    {!item && <label>Upload as<select aria-label="Upload as" value={uploadAs} disabled={busy||started} onChange={e=>setUploadAs(e.target.value as 'separate'|'one_video')}>
      <option value="separate">Separate videos · one per screenshot</option>
      <option value="one_video">One video · multiple screenshots</option>
    </select></label>}
    {!item && <label>Start filling from<input type="date" value={start} min={torontoDate()} disabled={busy||started} onChange={e=>{if(e.target.value)setStart(e.target.value)}}/></label>}
    <label className="screenshot-picker">Choose screenshots<input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple disabled={busy} onChange={e=>choose(e.target.files)}/></label>
    <small>PNG, JPG or WebP · up to 20 files · 10 MB each</small>
    {grouped && queue.length>0 && <div className="grouped-video-details">
      <label>Video title<input aria-label="Video title" value={videoTitle} maxLength={200} disabled={busy||started} onChange={e=>setVideoTitle(e.target.value)}/></label>
      <label>Video type<select aria-label="Video type" value={videoType} disabled={busy||started} onChange={e=>setVideoType(e.target.value as ContentType)}><option value="comic">Comic</option><option value="internet_post">Internet post</option></select></label>
      <p className="detail-hint"><strong>{queue.length} screenshots → 1 video</strong><br/>{groupSaved?.due_date?`${dayLabel(groupSaved.due_date)} · ${timeLabel(groupSaved.upload_time)}`:dates[0]?`${dayLabel(dates[0].day)} · ${timeLabel(dates[0].time)}`:started?'Retry keeps the same video and any date already reserved.':`No open ${videoType==='comic'?'comic':'internet-post'} dates—set daily targets or choose another type.`}</p>
    </div>}
    <div className="upload-queue">{queue.map((row,index)=>{
      const date=!grouped && row.status==='waiting'?dates[waitingIndex++]:null;
      const label=(grouped?videoType:row.contentType)==='comic'?'Comic':'Internet post';
      return <article className="queued-screenshot" key={row.id}>
        <div><strong>{index+1}. {row.file.name}</strong>
          {!item && !grouped && <>
            <label>Type<select aria-label={`Type for ${row.file.name}`} value={row.contentType} disabled={busy||row.status!=='waiting'} onChange={e=>{const contentType=e.target.value as ContentType;setQueue(rows=>rows.map(q=>q.id===row.id?{...q,contentType}:q));}}>
              <option value="comic">Comic</option><option value="internet_post">Internet post</option>
            </select></label>
            <input aria-label={`Title for ${row.file.name}`} value={row.title} maxLength={200} disabled={busy||row.status!=='waiting'} onChange={e=>setQueue(rows=>rows.map(q=>q.id===row.id?{...q,title:e.target.value}:q))}/>
          </>}
          <small>{row.status==='done'?`Saved · ${label}${row.saved?.due_date?` · ${dayLabel(row.saved.due_date)} · ${timeLabel(row.saved.upload_time)}`:''}`:row.status==='uploading'?'Uploading…':row.status==='error'?'Retry keeps any date already reserved for this file.':item?'Adds to this submission':grouped?`Screenshot ${index+1} of ${queue.length} for this video`:date?`${dayLabel(date.day)} · ${timeLabel(date.time)}`:`No open ${label.toLowerCase()} dates—set daily targets or choose another type.`}</small>
          {row.error && <p role="alert">{row.error}</p>}
        </div>
        {!item && !started && <div className="queue-order"><button className="text-button" disabled={index===0||busy} aria-label={`Move ${row.file.name} earlier`} onClick={()=>move(index,-1)}>↑</button><button className="text-button" disabled={index===queue.length-1||busy} aria-label={`Move ${row.file.name} later`} onClick={()=>move(index,1)}>↓</button></div>}
      </article>;
    })}</div>
    {!item && queue.length>0 && <p className="detail-hint">Dates shown are a preview. The server checks again while saving so two people won’t fill the same slot. Uploaded screenshots still need editing and scheduling.</p>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    {queue.length>0 && <button className="primary" disabled={busy||!actorId||done===queue.length||hasMissingDate} onClick={()=>void upload()}>{busy?'Uploading…':done===queue.length?'All screenshots saved':queue.some(q=>q.status==='error')?'Retry remaining uploads':item?'Upload screenshots':grouped?'Upload as one video':'Upload and assign dates'}</button>}
    {!actorId && <p className="detail-hint">Choose your name above before uploading.</p>}
    <p role="status" aria-live="polite">{done>0?`${done} of ${queue.length} saved. Everyone with the team PIN can open them.`:''}</p>
  </section>;
}
export function ScreenshotAttachments({item,data,channel,actorId,request,onSaved,onBusy}:{item:Item;data:Snapshot;channel:Channel;actorId:string;request:FileRequest;onSaved:()=>void;onBusy:(busy:boolean)=>void}) {
  const [files,setFiles]=useState<Screenshot[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [confirm,setConfirm]=useState('');
  const generation=useRef(0);
  const refresh=useCallback(async()=>{const n=++generation.current;try{const result=await request({action:'list',item_id:item.id});if(n===generation.current){setFiles(result.attachments);setError('');}}catch(err){if(n===generation.current)setError(message(err));}},[item.id,request]);
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},45000);return()=>{generation.current++;window.clearInterval(timer);};},[refresh]);
  async function download(file:Screenshot){setBusy(true);try{const result=await request({action:'download',item_id:item.id,id:file.id});const a=document.createElement('a');a.href=result.url;a.download=file.file_name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();}catch(err){setError(message(err));}finally{setBusy(false);}}
  async function remove(file:Screenshot){setBusy(true);onBusy(true);try{await request({action:'remove',id:file.id,actor_id:actorId});setConfirm('');await refresh();onSaved();}catch(err){setError(message(err));}finally{setBusy(false);onBusy(false);}}
  return <section className="screenshot-section"><div className="section-heading"><h3>Screenshots <small>({files.length})</small></h3><button className="text-button" onClick={()=>void refresh()}>Refresh files</button></div><div className="screenshot-grid">{files.map(file=><article key={file.id}>{file.preview_url?<a href={file.preview_url} target="_blank" rel="noreferrer"><img src={file.preview_url} alt={file.file_name} loading="lazy"/></a>:<div className="screenshot-placeholder">{file.state==='pending'?'Upload incomplete':file.state==='deleting'?'Removal incomplete':'Preview unavailable'}</div>}<strong>{file.file_name}</strong><small>{file.uploader||'Teammate'} · {(file.byte_size/1024/1024).toFixed(1)} MB</small><div className="screenshot-actions"><button className="secondary" disabled={busy||file.state!=='ready'} onClick={()=>void download(file)}>Download original</button>{confirm===file.id?<><button className="text-button danger" disabled={busy} onClick={()=>void remove(file)}>Confirm removal</button><button className="text-button" onClick={()=>setConfirm('')}>Cancel</button></>:<button className="text-button" disabled={busy||!actorId} onClick={()=>setConfirm(file.id)}>Remove</button>}</div></article>)}</div>{!files.length&&!error&&<p className="detail-hint">No screenshots attached yet.</p>}{error&&<p className="studio-error" role="alert">{error}</p>}<ScreenshotUpload data={data} channel={channel} item={item} actorId={actorId} request={request} onSaved={()=>{void refresh();onSaved();}} onBusy={value=>{setBusy(value);onBusy(value);}}/></section>;
}
