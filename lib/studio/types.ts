export type ContentType = "comic" | "internet_post";
export type Stage = "script" | "voiceover" | "edit" | "scheduled";
export const STAGES: { id: Stage; label: string }[] = [
  { id: "script", label: "Script" },
  { id: "voiceover", label: "Voiceover" },
  { id: "edit", label: "Edit" },
  { id: "scheduled", label: "Scheduled" },
];
export type Workspace = { id: string; name: string; owner_id: string; invite_code: string | null };
export type Member = { user_id: string; display_name: string; active: boolean };
export type Channel = { id: string; workspace_id: string; name: string; handle: string; comic_goal: number; post_goal: number };
export type DailyGoal = { channel_id: string; day: string; comic_goal: number; post_goal: number };
export type Item = { id: string; channel_id: string; due_date: string; title: string; content_type: ContentType; link: string; notes: string; submitted_by: string; created_at: string; version: number };
export type Step = { item_id: string; stage: Stage; assigned_to: string | null; completed_by: string | null; completed_at: string | null; version: number };
export type Activity = { id: string; channel_id: string | null; item_id: string | null; actor_id: string; actor_name: string; action: string; title: string; stage: Stage | null; created_at: string };
export type Snapshot = { workspace: Workspace; channels: Channel[]; members: Member[]; goals: DailyGoal[]; items: Item[]; steps: Step[]; activity: Activity[] };
export type Operation = "add_item" | "edit_item" | "delete_item" | "set_step" | "add_channel" | "edit_channel" | "set_goal" | "rotate_invite" | "remove_member" | "restore_member";

export function torontoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function shiftDate(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function weekDays(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(day, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}
export function dayLabel(day: string, options: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}
export function goalFor(data: Snapshot, channel: Channel, day: string) {
  return data.goals.find(g => g.channel_id === channel.id && g.day === day) ?? channel;
}
export function isFinished(item: Item, steps: Step[]) {
  return steps.some(s => s.item_id === item.id && (s.stage === "edit" || s.stage === "scheduled") && s.completed_at);
}
export function countsFor(data: Snapshot, channel: Channel, day: string, type: ContentType) {
  const items = data.items.filter(i => i.channel_id === channel.id && i.due_date === day && i.content_type === type);
  const goal = goalFor(data, channel, day);
  const target = type === "comic" ? goal.comic_goal : goal.post_goal;
  const finished = items.filter(i => isFinished(i, data.steps)).length;
  return { target, submitted: items.length, finished, remaining: Math.max(0, target - finished), unplanned: Math.max(0, target - items.length) };
}
export function safeLink(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
