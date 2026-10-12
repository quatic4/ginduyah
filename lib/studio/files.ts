import { goalFor, shiftDate, torontoDate, type Channel, type ContentType, type Snapshot } from "./types";
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export type Screenshot = { id:string; item_id:string; file_name:string; byte_size:number; state:'pending'|'ready'|'deleting'; uploader?:string; uploaded_by:string; created_at:string; preview_url?:string|null; due_date?:string; upload_time?:string|null; content_type?:ContentType };
export type FileRequest = (body: FormData | Record<string,unknown>) => Promise<any>;
export type BatchDate = { day:string; time:string|null };
// Keep this allocation in sync with shared_studio.next_screenshot_slot. Reserving
// virtual items makes each row's preview account for the earlier rows in a batch.
export function batchDates(data:Snapshot, channel:Channel, types:ContentType[], start:string, now=new Date()): (BatchDate|null)[] {
  const today=torontoDate(now);
  const time = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  const first = start > today ? start : today;
  const items: Pick<Snapshot['items'][number], 'due_date'|'content_type'|'upload_time'>[] = data.items.filter(i=>i.channel_id===channel.id);
  return types.map(type => {
    const standard = channel.handle.toLowerCase()==='@ginduyah' ? type==='comic' ? ['11:00','21:00'] : ['16:00'] : [];
    for(let n=0;n<=365;n++) {
      const day=shiftDate(first,n);
      const goals=goalFor(data,channel,day);
      const target=type==='comic'?goals.comic_goal:goals.post_goal;
      const taken=items.filter(i=>i.due_date===day);
      if(taken.filter(i=>i.content_type===type).length>=target)continue;
      if(day===today && standard.length && time>=standard[standard.length-1])continue;
      const slot=standard.find(t=>(day!==today || t>time) && !taken.some(i=>i.upload_time===t)) ?? null;
      // Extra targets can have an unset time; ordinary slots must remain usable.
      if(standard.length && slot===null && target<=standard.length)continue;
      items.push({due_date:day,content_type:type,upload_time:slot});
      return {day,time:slot};
    }
    return null;
  });
}
export function screenshotError(file:File) {
  if(!file.size || file.size>MAX_SCREENSHOT_BYTES) return 'Use a file of 10 MB or smaller.';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) return 'Use PNG, JPG or WebP screenshots.';
  return '';
}
