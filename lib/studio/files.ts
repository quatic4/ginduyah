import { goalFor, shiftDate, torontoDate, type Channel, type Snapshot } from "./types";
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export type Screenshot = { id:string; item_id:string; file_name:string; byte_size:number; state:'pending'|'ready'|'deleting'; uploader?:string; uploaded_by:string; created_at:string; preview_url?:string|null; due_date?:string; upload_time?:string|null };
export type FileRequest = (body: FormData | Record<string,unknown>) => Promise<any>;
export function batchDates(data:Snapshot, channel:Channel, count:number, start:string, now=new Date()) {
  const today=torontoDate(now);
  const time = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  let day = start > today ? start : today;
  if (channel.handle.toLowerCase()==='@ginduyah' && time >= '16:00' && day===today) day=shiftDate(today,1);
  const dates: {day:string;time:string|null}[]=[];
  for(let n=0;n<=365 && dates.length<count;n++) {
    const date=shiftDate(day,n); const goal=goalFor(data,channel,date).post_goal;
    const taken=data.items.filter(i=>i.channel_id===channel.id && i.due_date===date);
    const needed=Math.max(0,goal-taken.filter(i=>i.content_type==='internet_post').length);
    for(let slot=0;slot<needed && dates.length<count;slot++) dates.push({day:date,time:channel.handle.toLowerCase()==='@ginduyah' && slot===0 && !taken.some(i=>i.upload_time==='16:00') ? '16:00' : null});
  }
  return dates;
}
export function screenshotError(file:File) {
  if(!file.size || file.size>MAX_SCREENSHOT_BYTES) return 'Use a file of 10 MB or smaller.';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) return 'Use PNG, JPG or WebP screenshots.';
  return '';
}
