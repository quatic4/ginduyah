"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { batchDates, screenshotError, type FileRequest, type Screenshot } from '@/lib/studio/files';
import { dayLabel, torontoDate, type Channel, type Item, type Snapshot } from '@/lib/studio/types';
import { timeLabel } from '@/lib/studio/calendar';

type Queued = { id:string; file:File; title:string; status:'waiting'|'uploading'|'done'|'error'; error?:string; saved?:Screenshot };
const message = (error:unknown) => error instanceof Error ? error.message : 'Could not save. Please retry.';
export function ScreenshotUpload({ data, channel, item, actorId, request, onSaved, onBusy }: {data:Snapshot;channel:Channel;item?:Item;actorId:string;request:FileRequest;onSaved:()=>void;onBusy:(busy:boolean)=>void}) {
  const [queue,setQueue]=useState<Queued[]>([]);
  const [start,setStart]=useState(torontoDate);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const running=useRef(false);
  const input=useRef<HTMLInputElement>(null);
  const dates=batchDates(data,channel,queue.filter(q=>q.status!=='done').length,start);
  function choose(files:FileList|null) {
    if(!files)return;
    if(files.length>20){setError('Choose up to 20 screenshots in one batch.');return;}
    const next=Array.from(files);
    const invalid=next.find(f=>screenshotError(f));
    if(invalid){setError(`${invalid.name}: ${screenshotError(invalid)}`);return;}
    setError('');setQueue(next.map(file=>({id:crypto.randomUUID(),file,title:file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '),status:'waiting'})));
  }
  async function upload() {
    if(running.current || !actorId)return;
    running.current=true;setBusy(true);onBusy(true);setError('');
    try {
      for(const row of queue.filter(q=>q.status!=='done')) {
        setQueue(list=>list.map(q=>q.id===row.id?{...q,status:'uploading',error:undefined}:q));
        const form=new FormData();form.set('file',row.file);form.set('id',row.id);form.set('actor_id',actorId);
        if(item)form.set('item_id',item.id);else{form.set('channel_id',channel.id);form.set('start_date',start);form.set('title',row.title || 'Internet post screenshot');}
        try {
          const result=await request(form);
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
  let pendingIndex=0;
  return <section className="screenshot-uploader"><h3>{item?'Add screenshots':'Upload internet-post screenshots'}</h3><p>{item?'Add one or several screenshots to this submission.':'Each screenshot becomes one internet-post submission. Dates fill the next open internet-post slots in the order below.'} Originals are kept at full resolution.</p>
    {!item && <label>Start filling from<input type="date" value={start} min={torontoDate()} disabled={busy||queue.some(q=>q.status==='done'||q.status==='error')} onChange={e=>{if(e.target.value)setStart(e.target.value)}}/></label>}
    <label className="screenshot-picker">Choose screenshots<input ref={input} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple disabled={busy} onChange={e=>choose(e.target.files)}/></label><small>PNG, JPG or WebP · up to 20 files · 10 MB each</small>
    <div className="upload-queue">{queue.map((row,index)=>{const date=row.status==='done'?null:dates[pendingIndex++];return <article className="queued-screenshot" key={row.id}><div><strong>{index+1}. {row.file.name}</strong>{!item && <input aria-label={`Title for ${row.file.name}`} value={row.title} maxLength={200} disabled={busy||row.status!=='waiting'} onChange={e=>setQueue(rows=>rows.map(q=>q.id===row.id?{...q,title:e.target.value}:q))}/>}<small>{row.status==='done'?`Saved${row.saved?.due_date?` · ${dayLabel(row.saved.due_date)} · ${timeLabel(row.saved.upload_time)}`:''}`:row.status==='uploading'?'Uploading…':item?'Adds to this submission':date?`${dayLabel(date.day)} · ${timeLabel(date.time)}`:'No open dates—set internet-post daily targets.'}</small>{row.error && <p role="alert">{row.error}</p>}</div>{!item && !queue.some(q=>q.status!=='waiting') && <div className="queue-order"><button className="text-button" disabled={index===0||busy} aria-label={`Move ${row.file.name} earlier`} onClick={()=>move(index,-1)}>↑</button><button className="text-button" disabled={index===queue.length-1||busy} aria-label={`Move ${row.file.name} later`} onClick={()=>move(index,1)}>↓</button></div>}</article>;})}</div>
    {!item && queue.length>0 && <p className="detail-hint">Dates shown are a preview. The server checks again while saving so two people won’t fill the same slot. Uploaded screenshots still need editing and scheduling.</p>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    {queue.length>0 && <button className="primary" disabled={busy||!actorId||queue.every(q=>q.status==='done')||(!item&&!dates.length)} onClick={()=>void upload()}>{busy?'Uploading…':queue.every(q=>q.status==='done')?'All screenshots saved':queue.some(q=>q.status==='error')?'Retry remaining uploads':item?'Upload screenshots':'Upload and assign dates'}</button>}
    {!actorId && <p className="detail-hint">Choose your name above before uploading.</p>}
    <p role="status" aria-live="polite">{queue.filter(q=>q.status==='done').length>0?`${queue.filter(q=>q.status==='done').length} of ${queue.length} saved. Everyone with the team PIN can open them.`:''}</p>
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
