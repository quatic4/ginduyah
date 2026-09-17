"use client";
import { useState, type FormEvent } from "react";
import { dayLabel, safeLink, type Channel, type ContentType, type Item, type Member } from "@/lib/studio/types";

export function ItemForm({ item, channel, day, type = "comic", busy, onSave, onDelete }: { item?: Item; channel: Channel; day: string; type?: ContentType; busy: boolean; onSave: (payload: Record<string, unknown>) => void; onDelete?: (version: number) => void }) {
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [version] = useState(item?.version);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const link = String(form.get("link") || "").trim();
    const title = String(form.get("title") || "").trim();
    if (!title) { setError("Give this submission a title."); return; }
    if (link && !safeLink(link)) { setError("Use a full https:// or http:// link."); return; }
    setError("");
    onSave({ channel_id: channel.id, item_id: item?.id, version, title, content_type: form.get("content_type"), due_date: form.get("due_date"), link, notes: form.get("notes"), initial_status: form.get("initial_status") || "planned" });
  }
  return <form onSubmit={submit} className="studio-form">
    <label>Title<input name="title" required maxLength={200} defaultValue={item?.title} placeholder="What are we making?" autoFocus /></label>
    <div className="form-pair"><label>Type<select name="content_type" defaultValue={item?.content_type || type}><option value="comic">Comic</option><option value="internet_post">Internet post</option></select></label><label>Upload date<input name="due_date" required type="date" defaultValue={item?.due_date || day} /></label></div>
    <label>Source or finished file link <span className="muted">(optional)</span><input name="link" type="url" maxLength={2000} defaultValue={item?.link} placeholder="Paste a Drive, Discord, or source link" /></label>
    <label>Notes <span className="muted">(optional)</span><textarea name="notes" rows={3} maxLength={4000} defaultValue={item?.notes} placeholder="Script notes, context, or what still needs doing…" /></label>
    {!item && <label>Current status<select name="initial_status"><option value="planned">Needs work</option><option value="ready">Edited and ready</option><option value="scheduled">Already scheduled</option></select><small>Finished stages will be credited to your selected name. Add unfinished work first if a teammate will complete it.</small></label>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    <div className="form-actions">{onDelete && <button type="button" className="text-button danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Remove submission</button>}<button className="primary" disabled={busy}>{busy ? "Saving…" : item ? "Save changes" : "Add submission"}</button></div>
    {confirmDelete && <div className="delete-confirm"><p>Remove this submission and its stage credits? The activity history will keep a record.</p><button type="button" className="danger-button" disabled={busy} onClick={() => onDelete?.(version!)}>Yes, remove it</button><button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Keep it</button></div>}
  </form>;
}

export function ChannelForm({ channel, busy, onSave }: { channel?: Channel; busy: boolean; onSave: (payload: Record<string, unknown>) => void }) {
  const [version] = useState(channel?.version);
  return <form className="studio-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ channel_id: channel?.id, version, name: String(data.get("name")).trim(), handle: String(data.get("handle") || "").trim(), comic_goal: Number(data.get("comic_goal")), post_goal: Number(data.get("post_goal")) }); }}>
    <label>Channel name<input required name="name" maxLength={60} defaultValue={channel?.name} placeholder="Your channel" /></label><label>YouTube handle <span className="muted">(optional)</span><input name="handle" maxLength={101} pattern="@[A-Za-z0-9_.\-]+" defaultValue={channel?.handle} placeholder="@yourchannel" /><small>Add a handle to include this channel in Site stats.</small></label>
    {!channel && <div className="form-pair"><label>Comics per day<input name="comic_goal" required type="number" min={0} max={50} defaultValue={1} /></label><label>Internet posts per day<input name="post_goal" required type="number" min={0} max={50} defaultValue={0} /></label></div>}
    <button className="primary" disabled={busy}>{busy ? "Saving…" : channel ? "Save channel" : "Add channel"}</button>
  </form>;
}

export function MemberForm({ member, busy, onSave }: { member?: Member; busy: boolean; onSave: (payload: Record<string, unknown>) => void }) {
  const [version] = useState(member?.version);
  return <form className="studio-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ user_id: member?.user_id, version, display_name: String(form.get("display_name") || "").trim() }); }}>
    <label>Display name<input name="display_name" required maxLength={40} defaultValue={member?.display_name} placeholder="What should we call them?" autoFocus /></label>
    <p>{member ? "The new name appears on their submissions and credits. Activity keeps the name used when each change happened." : "They can pick this name from any device. No email, password, or account needed."}</p>
    <button className="primary" disabled={busy}>{busy ? "Saving…" : member ? "Save name" : "Add teammate"}</button>
  </form>;
}

export function GoalForm({ day, comicGoal, postGoal, version: initialVersion, busy, onSave }: { day: string; comicGoal: number; postGoal: number; version: number; busy: boolean; onSave: (payload: Record<string, unknown>) => void }) {
  const [version] = useState(initialVersion);
  return <form className="studio-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); onSave({ version, comic_goal: Number(form.get("comic_goal")), post_goal: Number(form.get("post_goal")) }); }}>
    <p>Targets for {dayLabel(day)}. Other days keep their existing targets.</p>
    <div className="form-pair"><label>Comics<input required type="number" name="comic_goal" min={0} max={50} defaultValue={comicGoal} /></label><label>Internet posts<input required type="number" name="post_goal" min={0} max={50} defaultValue={postGoal} /></label></div>
    <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save targets"}</button>
  </form>;
}
