import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadTS } from './load-ts.mjs';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const modules=await loadTS(['lib/studio/types','lib/studio/files']);
const {batchDates}=await modules.load('lib/studio/files');
const db=new PGlite({extensions:{pgcrypto}});
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].result;
try {
  await db.exec('create role anon;create role authenticated;create role service_role;');
  for(const name of ['20260917214744_shared_studio_without_accounts','20260918185010_studio_pin_access','20261005181755_studio_calendar_times'])await db.exec(await readFile(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(process.env.ATTACHMENT_SCHEMA || new URL('../supabase/migrations/20261006062930_studio_screenshots_and_batch_dates.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261012005517_mixed_screenshot_types.sql',import.meta.url),'utf8'));
  await db.query('select shared_studio.set_pin($1)',['7531']);
  const snapshot=await value('select shared_studio.snapshot() as result');const channel=snapshot.channels.find(c=>c.handle==='@ginduyah')||snapshot.channels[0];
  const actor=snapshot.members[0].user_id;
  const token=(await value('select public.studio_pin_unlock($1) as result',['7531'])).access_token;
  const call=(action,payload={},who=actor,t=token)=>value('select public.studio_files($1,$2,$3,$4) as result',[t,who,action,JSON.stringify(payload)]);
  const mutate=(operation,payload)=>value('select public.studio_pin_mutate($1,$2,$3,$4) as result',[token,actor,operation,JSON.stringify(payload)]);
  const tomorrow=await value("select ((now() at time zone 'America/Toronto')::date+1)::text as result");
  const next=await value("select ((now() at time zone 'America/Toronto')::date+2)::text as result");
  const third=await value("select ((now() at time zone 'America/Toronto')::date+3)::text as result");
  await mutate('add_item',{channel_id:channel.id,due_date:tomorrow,title:'Existing post',content_type:'internet_post',initial_status:'planned'});
  await mutate('set_goal',{channel_id:channel.id,day:next,comic_goal:2,post_goal:0,version:0});
  await db.exec('set role anon');
  await assert.rejects(call('authorize'),/permission denied/);
  await assert.rejects(db.query('select * from shared_studio.attachments'),/permission denied/);
  await db.exec('reset role;set role service_role');
  await assert.rejects(call('authorize',{},actor,'f'.repeat(64)),/session ended/);
  const base={id:crypto.randomUUID(),channel_id:channel.id,start_date:tomorrow,title:'Nana test',file_name:'screen.png',mime_type:'image/png',byte_size:500,sha256:'a'.repeat(64)};
  const reserved=await call('reserve',base);
  assert.equal(reserved.due_date,third,'Skips occupied and zero-goal dates');assert.equal(reserved.upload_time,'16:00');
  assert.equal(reserved.state,'pending');
  await assert.rejects(call('reserve',base),/still be finishing/);
  await assert.rejects(call('remove',{id:base.id}),/finishing/);
  const finished=await call('complete',{id:base.id});assert.equal(finished.state,'ready');
  assert.equal((await call('reserve',base)).item_id,reserved.item_id,'Retry does not create another submission');
  await assert.rejects(call('reserve',{...base,sha256:'b'.repeat(64)}),/another file/);
  const list=await call('list',{item_id:reserved.item_id},null);assert.equal(list.length,1);assert.equal(list[0].uploader,snapshot.members[0].display_name);
  await assert.rejects(call('reserve',{...base,id:crypto.randomUUID(),item_id:reserved.item_id,byte_size:20_000_000}),/check constraint/);
  await db.exec('reset role');
  let state=await value('select shared_studio.snapshot() as result');
  const created=state.items.find(i=>i.id===reserved.item_id);
  assert.equal(created.content_type,'internet_post');assert.equal(state.steps.filter(s=>s.item_id===created.id).every(s=>!s.completed_at),true,'Screenshot alone never marks edit or schedule complete');
  await assert.rejects(mutate('delete_item',{item_id:created.id,version:created.version}),/screenshots before deleting/);
  await db.exec('set role service_role');
  const second=await call('reserve',{...base,id:crypto.randomUUID(),item_id:reserved.item_id});assert.equal(second.item_id,created.id,'Several screenshots can belong to one post');
  await call('complete',{id:second.id});
  assert.equal((await call('list',{item_id:created.id})).length,2);
  await call('remove',{id:base.id});await call('removed',{id:base.id});
  assert.equal((await call('list',{item_id:created.id})).length,1);
  await call('remove',{id:second.id});await call('removed',{id:second.id});
  await db.exec('reset role');await mutate('delete_item',{item_id:created.id,version:created.version});
  state=await value('select shared_studio.snapshot() as result');assert.equal(state.items.some(i=>i.id===created.id),false);
  assert.equal(await value("select has_function_privilege('anon','shared_studio.mutate(uuid,text,jsonb)','execute') as result"),false);
  // A comic batch creates a comic item, and attachments inherit the existing type.
  await db.exec('set role service_role');
  const comicPayload={...base,id:crypto.randomUUID(),content_type:'comic'};
  const comic=await call('reserve',comicPayload);
  assert.equal(comic.content_type,'comic');assert.equal(comic.upload_time,'11:00');assert.equal(comic.due_date,tomorrow);
  await call('complete',{id:comic.id});
  await assert.rejects(call('reserve',{...comicPayload,content_type:'internet_post'}),/original submission and type/);
  await assert.rejects(call('reserve',{...comicPayload,item_id:crypto.randomUUID()}),/original submission and type/);
  assert.equal((await call('reserve',comicPayload)).item_id,comic.item_id);
  await db.exec('reset role;set role anon');
  const beforePanels=await value('select public.studio_pin_snapshot($1) as result',[token]);
  await db.exec('reset role;set role service_role');
  const panel=await call('reserve',{...base,id:crypto.randomUUID(),item_id:comic.item_id});
  assert.equal(panel.content_type,'comic','Extra panels inherit the submission type');
  const thirdPanel=await call('reserve',{...base,id:crypto.randomUUID(),item_id:comic.item_id});
  await call('complete',{id:panel.id});await call('complete',{id:thirdPanel.id});
  const groupFiles=await call('list',{item_id:comic.item_id});
  assert.equal(groupFiles.length,3);assert.equal(groupFiles.every(file=>file.item_id===comic.item_id && file.state==='ready'),true);
  await db.exec('reset role;set role anon');
  const afterPanels=await value('select public.studio_pin_snapshot($1) as result',[token]);
  assert.equal(afterPanels.items.length,beforePanels.items.length,'Three screenshots consume only one video/date slot');
  await db.exec('reset role;set role service_role');
  await assert.rejects(call('reserve',{...base,id:crypto.randomUUID(),content_type:'video'}),/Choose Comic/);
  await db.exec('reset role');
  assert.equal(await value("select has_function_privilege('anon','shared_studio.next_screenshot_slot(uuid,text,date,timestamptz)','execute') as result"),false);

  // Compare preview and database against the same clock and occupied slots.
  // These transactions are isolated fixtures; nothing changes the previous cases.
  const mixed=['comic','internet_post','comic','internet_post','comic'];
  const cases=[
    {clock:'2026-10-15T14:00:00Z',expected:[['2026-10-15','11:00'],['2026-10-15','16:00'],['2026-10-15','21:00'],['2026-10-16','16:00'],['2026-10-16','11:00']]},
    {clock:'2026-10-15T15:00:00Z',expected:[['2026-10-15','21:00'],['2026-10-15','16:00'],['2026-10-16','11:00'],['2026-10-16','16:00'],['2026-10-16','21:00']]},
    {clock:'2026-10-15T20:00:00Z'},
    {clock:'2026-10-16T01:00:00Z'},
    {clock:'2026-11-01T15:59:00Z'}, // daylight saving time ends
    {clock:'2027-03-14T15:00:00Z'}, // daylight saving time begins
    {clock:'2026-10-15T14:00:00Z',comic:0,post:0,expected:[null,null,null,null,null]},
    {clock:'2026-10-15T14:00:00Z',comic:3,post:2},
    {clock:'2026-10-15T14:00:00Z',handle:'@gleebyreads',comic:1,post:0},
    {clock:'2026-10-15T14:00:00Z',occupied:[['comic','11:00'],['internet_post','21:00']]},
    {clock:'2026-10-15T14:00:00Z',override:true},
  ];
  for(const fixture of cases){
    await db.exec('begin');
    const fixtureId=crypto.randomUUID();
    await db.query('insert into shared_studio.channels(id,workspace_id,name,handle,comic_goal,post_goal) values($1,$2,$3,$4,$5,$6)',[fixtureId,snapshot.workspace.id,'Test batch',fixture.handle||'@ginduyah',fixture.comic??2,fixture.post??1]);
    const fixtureChannel={...channel,id:fixtureId,handle:fixture.handle||'@ginduyah',comic_goal:fixture.comic??2,post_goal:fixture.post??1};
    const insert=(day,type,time)=>db.query('insert into shared_studio.items(channel_id,due_date,content_type,upload_time,title,submitted_by) values($1,$2,$3,$4,$5,$6)',[fixtureId,day,type,time,'Fixture',actor]);
    for(const [type,time] of fixture.occupied||[])await insert('2026-10-15',type,time);
    if(fixture.override)await db.query('insert into shared_studio.goals(channel_id,day,comic_goal,post_goal) values($1,$2,0,0)',[fixtureId,'2026-10-15']);
    const current=await value('select shared_studio.snapshot() as result');
    const preview=batchDates(current,fixtureChannel,mixed,'2026-10-15',new Date(fixture.clock));
    const actual=[];
    for(const type of mixed){
      const slot=await value('select shared_studio.next_screenshot_slot($1,$2,$3,$4) as result',[fixtureId,type,'2026-10-15',fixture.clock]);
      actual.push(slot);
      if(slot)await insert(slot.day,type,slot.time);
    }
    assert.deepEqual(actual,preview,`Database and preview agree: ${JSON.stringify(fixture)}`);
    if(fixture.expected)assert.deepEqual(actual,fixture.expected.map(slot=>slot?{day:slot[0],time:slot[1]}:null));
    await db.exec('rollback');
  }
  console.log('PASS: screenshot privacy, PIN, idempotency, date allocation, pending leases, multiple files, shared reads and safe removal.');
} finally {await db.close();await modules.close();}
