import { STAGES, shiftDate, type Operation, type Snapshot } from "./types";

// Explicit, in-memory preview only. This is never sent to Supabase or treated as team data.
export function previewSnapshot(today: string): Snapshot {
  const now = new Date().toISOString();
  const data: Snapshot = {
    workspace: { id: "preview", name: "The upload crew", revision: 1 },
    members: [{ user_id: "preview-you", display_name: "You", active: true, version: 1 }, { user_id: "preview-friend", display_name: "Teammate", active: true, version: 1 }],
    channels: [
      { id: "preview-ginduyah", workspace_id: "preview", name: "ginduyah", handle: "@ginduyah", comic_goal: 2, post_goal: 1, version: 1 },
      { id: "preview-nba", workspace_id: "preview", name: "NBA comics", handle: "", comic_goal: 1, post_goal: 0, version: 1 },
    ], goals: [], items: [], steps: [], activity: [],
  };
  const samples = [
    { title: "sample comic · the group chat", type: "comic" as const, day: today, channel: data.channels[0].id, done: ["script", "voiceover", "edit"] },
    { title: "sample internet post · wrong number", type: "internet_post" as const, day: today, channel: data.channels[0].id, done: ["script"] },
    { title: "sample comic · one last game", type: "comic" as const, day: shiftDate(today, 1), channel: data.channels[0].id, done: ["script", "voiceover"] },
    { title: "sample NBA comic · practice is over", type: "comic" as const, day: today, channel: data.channels[1].id, done: ["script"] },
  ];
  samples.forEach((sample, n) => {
    const id = `preview-item-${n}`;
    data.items.push({ id, channel_id: sample.channel, due_date: sample.day, title: sample.title, content_type: sample.type, link: "", notes: "Example content for trying the board.", submitted_by: n % 2 ? "preview-friend" : "preview-you", created_at: now, version: 1 });
    for (const stage of STAGES) data.steps.push({ item_id: id, stage: stage.id, assigned_to: stage.id === "voiceover" ? "preview-friend" : "preview-you", completed_by: sample.done.includes(stage.id) ? (stage.id === "voiceover" ? "preview-friend" : "preview-you") : null, completed_at: sample.done.includes(stage.id) ? now : null, version: 1 });
  });
  return data;
}

export function mutatePreview(data: Snapshot, operation: Operation, payload: Record<string, unknown>, actorId = "preview-you"): Snapshot {
  const next = structuredClone(data);
  next.workspace.revision++;
  const actor = next.members.find(m => m.user_id === actorId && m.active);
  if (!actor) throw new Error("Choose an active team member.");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const item = next.items.find(i => i.id === payload.item_id);
  let title = item?.title || String(payload.name || payload.title || payload.day || "");
  if (operation === "add_item") {
    next.items.push({ id, channel_id: String(payload.channel_id), due_date: String(payload.due_date), title: String(payload.title), content_type: payload.content_type as "comic" | "internet_post", link: String(payload.link || ""), notes: String(payload.notes || ""), submitted_by: actorId, created_at: now, version: 1 });
    STAGES.forEach(stage => {
      const done = (stage.id === "edit" && ["ready", "scheduled"].includes(String(payload.initial_status))) || (stage.id === "scheduled" && payload.initial_status === "scheduled");
      next.steps.push({ item_id: id, stage: stage.id, assigned_to: null, completed_by: done ? actorId : null, completed_at: done ? now : null, version: 1 });
    });
  } else if (operation === "edit_item" && item) {
    Object.assign(item, { title: payload.title, content_type: payload.content_type, due_date: payload.due_date, link: payload.link, notes: payload.notes, version: item.version + 1 });
  } else if (operation === "delete_item" && item) {
    next.items = next.items.filter(i => i.id !== item.id);
    next.steps = next.steps.filter(s => s.item_id !== item.id);
  } else if (operation === "set_step") {
    const step = next.steps.find(s => s.item_id === payload.item_id && s.stage === payload.stage);
    if (step) {
      if ("assigned_to" in payload) step.assigned_to = payload.assigned_to ? String(payload.assigned_to) : null;
      else {
        if (step.stage === "scheduled" && payload.done && !next.steps.some(s => s.item_id === step.item_id && s.stage === "edit" && s.completed_at)) throw new Error("Mark the edit finished before scheduling.");
        if (step.stage === "edit" && !payload.done && next.steps.some(s => s.item_id === step.item_id && s.stage === "scheduled" && s.completed_at)) throw new Error("Reopen scheduling before reopening the edit.");
        step.completed_by = payload.done ? actorId : null; step.completed_at = payload.done ? now : null;
      }
      step.version++;
    }
  } else if (operation === "set_goal") {
    next.goals = next.goals.filter(g => !(g.channel_id === payload.channel_id && g.day === payload.day));
    next.goals.push({ channel_id: String(payload.channel_id), day: String(payload.day), comic_goal: Number(payload.comic_goal), post_goal: Number(payload.post_goal), version: Number(payload.version || 0) + 1 });
  } else if (operation === "add_channel") {
    next.channels.push({ id, workspace_id: "preview", name: String(payload.name), handle: String(payload.handle || ""), comic_goal: Number(payload.comic_goal), post_goal: Number(payload.post_goal), version: Number(payload.version || 0) + 1 });
  } else if (operation === "edit_channel") {
    const channel = next.channels.find(c => c.id === payload.channel_id);
    if (channel) Object.assign(channel, { name: payload.name, handle: payload.handle, version: channel.version + 1 });
  } else if (operation === "add_member" || operation === "edit_member") {
    const name = String(payload.display_name || "").trim();
    if (!name || name.length > 40) throw new Error("Use a name between 1 and 40 characters.");
    if (next.members.some(m => m.display_name.toLowerCase() === name.toLowerCase() && m.user_id !== payload.user_id)) throw new Error("That name is already on the roster.");
    if (operation === "add_member") next.members.push({ user_id: id, display_name: name, active: true, version: 1 });
    else {
      const member = next.members.find(m => m.user_id === payload.user_id);
      if (member) { member.display_name = name; member.version++; }
    }
    title = name;
  } else if (operation === "remove_member" || operation === "restore_member") {
    const member = next.members.find(m => m.user_id === payload.user_id);
    if (member) {
      if (operation === "remove_member" && next.members.filter(m => m.active).length <= 1) throw new Error("Keep at least one active team member.");
      member.active = operation === "restore_member"; member.version++; title = member.display_name;
      if (!member.active) next.steps.forEach(s => { if (s.assigned_to === member.user_id && !s.completed_at) { s.assigned_to = null; s.version++; } });
    }
  }
  const actions: Record<string, string> = { add_item: "submitted", edit_item: "updated", delete_item: "removed", set_goal: "changed targets for", add_channel: "added channel", edit_channel: "updated channel", add_member: "added teammate", edit_member: "renamed teammate to", remove_member: "removed teammate", restore_member: "restored teammate" };
  next.activity.unshift({ id: crypto.randomUUID(), channel_id: item?.channel_id || (payload.channel_id as string) || null, item_id: item?.id || null, actor_id: actorId, actor_name: actor.display_name, action: operation === "set_step" ? ("assigned_to" in payload ? "changed the assignment for" : payload.done ? "completed" : "reopened") : actions[operation] || operation, title, stage: operation === "set_step" ? payload.stage as typeof STAGES[number]["id"] : null, created_at: now });
  return next;
}
