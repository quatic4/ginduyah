import { goalFor, isFinished, shiftDate, type Channel, type ContentType, type Item, type Snapshot } from "./types";

export function itemStatus(data: Snapshot, item: Item) {
  if (data.steps.some(s => s.item_id === item.id && s.stage === "scheduled" && s.completed_at)) return "Scheduled";
  if (isFinished(item, data.steps)) return "Ready";
  return data.steps.some(s => s.item_id === item.id && s.completed_at) ? "In progress" : "Needs work";
}
export function timeLabel(time?: string | null) {
  if (!time) return "Time not set";
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours < 12 ? "AM" : "PM"}`;
}
export function dayCoverage(data: Snapshot, channel: Channel, day: string, type?: ContentType) {
  const goal = goalFor(data, channel, day);
  const types: ContentType[] = type ? [type] : ["comic", "internet_post"];
  const counts = types.map(kind => {
    const items = data.items.filter(i => i.channel_id === channel.id && i.due_date === day && i.content_type === kind);
    const target = kind === "comic" ? goal.comic_goal : goal.post_goal;
    const scheduled = items.filter(i => itemStatus(data, i) === "Scheduled").length;
    return { type: kind, target, scheduled, missing: Math.max(0, target - scheduled), ready: items.filter(i => itemStatus(data, i) === "Ready").length };
  });
  return { counts, target: counts.reduce((n, c) => n + c.target, 0), missing: counts.reduce((n, c) => n + c.missing, 0), scheduled: counts.reduce((n, c) => n + Math.min(c.target, c.scheduled), 0) };
}
// Full future days only. Today is reported separately; surplus on one date never
// hides a gap on another. Zero-target dates are skipped, not counted as stock.
export function coverageAhead(data: Snapshot, channel: Channel, today: string, type?: ContentType, horizon = 30) {
  let days = 0;
  let through: string | null = null;
  for (let offset = 1; offset <= horizon; offset++) {
    const day = shiftDate(today, offset);
    const count = dayCoverage(data, channel, day, type);
    if (count.missing) return { days, through, firstGap: day, capped: false, hasTargets: true };
    if (count.target) { days++; through = day; }
  }
  return { days, through, firstGap: null, capped: days > 0, hasTargets: days > 0 };
}
export function expectedSlots(data: Snapshot, channel: Channel, day: string) {
  const goal = goalFor(data, channel, day);
  const standard = channel.handle.toLowerCase() === "@ginduyah";
  const slots: { type: ContentType; time: string | null }[] = [];
  for (let i = 0; i < goal.comic_goal; i++) slots.push({ type: "comic", time: standard ? ["11:00", "21:00"][i] || null : null });
  for (let i = 0; i < goal.post_goal; i++) slots.push({ type: "internet_post", time: standard && i === 0 ? "16:00" : null });
  return slots.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
}
export function calendarSlots(data: Snapshot, channel: Channel, day: string) {
  const items = data.items.filter(i => i.channel_id === channel.id && i.due_date === day).sort((a, b) => (a.upload_time || "99:99").localeCompare(b.upload_time || "99:99") || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const used = new Set<string>();
  const slots = expectedSlots(data, channel, day).map(slot => {
    // Exact confirmed times first. An existing item with no time may be shown as
    // a suggestion, explicitly labelled; it is never written back automatically.
    const item = items.find(i => !used.has(i.id) && i.content_type === slot.type && (i.upload_time || null) === slot.time);
    if (item) used.add(item.id);
    return { ...slot, item, suggested: false };
  });
  for (const slot of slots) {
    if (slot.item) continue;
    const item = items.find(i => !used.has(i.id) && i.content_type === slot.type);
    if (item) { slot.item = item; slot.suggested = Boolean(slot.time && !item.upload_time); used.add(item.id); }
  }
  return { slots, extra: items.filter(i => !used.has(i.id)) };
}
