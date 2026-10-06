import assert from 'node:assert/strict';
import { loadTS } from './load-ts.mjs';
const modules=await loadTS(['lib/studio/types','lib/studio/files','supabase/functions/studio-files/handler']);
try {
  const {batchDates}=await modules.load('lib/studio/files');
  const {createFileHandler,imageMime,safeFilename}=await modules.load('supabase/functions/studio-files/handler');
  const channel={id:'a',handle:'@ginduyah',post_goal:1,comic_goal:2};
  const data={items:[{channel_id:'a',due_date:'2026-10-07',content_type:'internet_post'}],goals:[{channel_id:'a',day:'2026-10-08',post_goal:0}],channels:[channel]};
  const dates=batchDates(data,channel,2,'2026-10-06',new Date('2026-10-06T21:00:00Z'));
  assert.deepEqual(dates,[{day:'2026-10-09',time:'16:00'},{day:'2026-10-10',time:'16:00'}]);
  assert.equal(batchDates({...data,items:[],goals:[]},channel,1,'2026-10-06',new Date('2026-10-06T19:59:00Z'))[0].day,'2026-10-06');
  assert.deepEqual(batchDates(data,{...channel,post_goal:0},2,'2026-10-06'),[]);
  const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0]);
  assert.equal(imageMime(png),'image/png');assert.throws(()=>imageMime(new TextEncoder().encode('<svg/>')));
  assert.equal(safeFilename('../a.png','image/png').includes('/'),false);
  const token='a'.repeat(64);let calls=[];let files=[];const objects=new Map();
  const storage={
    upload:async(path,bytes,options)=>{calls.push(['upload',path,options]);objects.set(path,bytes);return {data:{path},error:null};},
    createSignedUrl:async(path,seconds,options)=>{calls.push(['sign',path,seconds,options]);return {data:{signedUrl:'https://example.invalid/private-file'},error:null};},
    remove:async(paths)=>{calls.push(['remove',...paths]);paths.forEach(p=>objects.delete(p));return {data:[],error:null};}
  };
  const admin={rpc:async(name,args)=>{
    calls.push(['rpc',args.action]);
    if(args.access_token!==token)return {data:null,error:{code:'28000'}};
    if(args.action==='authorize')return {data:{ok:true},error:null};
    if(args.action==='reserve'){const saved=files.find(f=>f.id===args.payload.id);if(saved)return {data:saved,error:null};const f={...args.payload,state:'pending',item_id:'item',object_path:'item/file.png',due_date:'2026-10-09'};files.push(f);return {data:f,error:null};}
    if(args.action==='complete'){files[0].state='ready';return {data:files[0],error:null};}
    if(args.action==='list')return {data:files,error:null};
    if(args.action==='remove')return {data:files[0],error:null};
    if(args.action==='removed'){files=[];return {data:{ok:true},error:null};}
  },storage:{getBucket:async()=>({data:{public:false},error:null}),createBucket:async()=>{throw Error('unexpected');},from:()=>storage}};
  const handler=createFileHandler(admin);
  const request=body=>new Request('https://example.invalid',{method:'POST',headers:{'x-studio-session':token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)});
  assert.equal((await handler(new Request('https://example.invalid',{method:'POST',body:'{}'}))).status,401);
  assert.equal(calls.length,0,'Rejects missing session before storage or body reads');
  const form=new FormData();form.set('file',new File([png],'screen.png',{type:'image/png'}));form.set('id','upload-id');form.set('actor_id','nana');form.set('channel_id','channel');
  let response=await handler(request(form));assert.equal(response.status,200);assert.equal((await response.json()).attachment.state,'ready');
  assert.deepEqual([...objects.values()][0],png,'Keeps exact original bytes');
  assert.equal(calls.find(c=>c[0]==='upload')[2].upsert,false);
  assert.equal(calls.findIndex(c=>c[1]==='authorize')<calls.findIndex(c=>c[0]==='upload'),true);
  await handler(request(form));assert.equal(calls.filter(c=>c[0]==='upload').length,1,'Success retry does not store duplicate');
  response=await handler(request({action:'list',item_id:'item'}));assert.equal((await response.json()).attachments[0].preview_url,'https://example.invalid/private-file');
  response=await handler(request({action:'download',item_id:'item',id:'wrong'}));assert.equal(response.status,404);
  response=await handler(request({action:'download',item_id:'item',id:'upload-id'}));assert.equal(response.status,200);assert.equal(calls.filter(c=>c[0]==='sign').at(-1)[2],60);assert.equal(calls.filter(c=>c[0]==='sign').at(-1)[3].download,'screen.png');
  const bad=new FormData();bad.set('file',new File(['not an image'],'fake.png',{type:'image/png'}));
  assert.equal((await handler(request(bad))).status,400);
  response=await handler(request({action:'remove',id:'upload-id',actor_id:'nana'}));assert.equal(response.status,200);assert.equal(objects.size,0);assert.equal(files.length,0);
  console.log('PASS: batch previews, cutoff, screenshot validation, exact-byte uploads, PIN enforcement, original downloads and deletion.');
} finally {await modules.close();}
