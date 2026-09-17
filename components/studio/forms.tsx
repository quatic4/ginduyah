"use client";
import { useState, type FormEvent } from "react";
import { safeLink, type Channel, type ContentType, type Item } from "@/lib/studio/types";

export function ItemForm({ item, channel, day, type = "comic", busy, onSave, onDelete }: { item?: Item; channel: Channel; day: string; type?: ContentType; busy: boolean; onSave: (payload: Record<string, unknown>) => void; onDelete?: () => void }) {
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const link = String(form.get("link") || "").trim();
    const title = String(form.get("title") || "").trim();
    if (!title) { setError("Give this submission a title."); return; }
    if (link && !safeLink(link)) { setError("Use a full https:// or http:// link."); return; }
    setError("");
    onSave({ channel_id: channel.id, item_id: item?.id, version: item?.version, title, content_type: form.get("content_type"), due_date: form.get("due_date"), link, notes: form.get("notes"), initial_status: form.get("initial_status") || "planned" });
  }
  return <form onSubmit={submit} className="studio-form">
    <label>Title<input name="title" required maxLength={200} defaultValue={item?.title} placeholder="What are we making?" autoFocus /></label>
    <div className="form-pair"><label>Type<select name="content_type" defaultValue={item?.content_type || type}><option value="comic">Comic</option><option value="internet_post">Internet post</option></select></label><label>Upload date<input name="due_date" required type="date" defaultValue={item?.due_date || day} /></label></div>
    <label>Source or finished file link <span className="muted">(optional)</span><input name="link" type="url" maxLength={2000} defaultValue={item?.link} placeholder="Paste a Drive, Discord, or source link" /></label>
    <label>Notes <span className="muted">(optional)</span><textarea name="notes" rows={3} maxLength={4000} defaultValue={item?.notes} placeholder="Script notes, context, or what still needs doing…" /></label>
    {!item && <label>Current status<select name="initial_status"><option value="planned">Needs work</option><option value="ready">Edited and ready</option><option value="scheduled">Already scheduled</option></select><small>Finished stages will be credited to your account. Add unfinished work first if a teammate will complete it.</small></label>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    <div className="form-actions">{onDelete && <button type="button" className="text-button danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Remove submission</button>}<button className="primary" disabled={busy}>{busy ? "Saving…" : item ? "Save changes" : "Add submission"}</button></div>
    {confirmDelete && <div className="delete-confirm"><p>Remove this submission and its stage credits? The activity history will keep a record.</p><button type="button" className="danger-button" disabled={busy} onClick={onDelete}>Yes, remove it</button><button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Keep it</button></div>}
  </form>;
}

export function ChannelForm({ channel, busy, onSave }: { channel?: Channel; busy: boolean; onSave: (payload: Record<string, unknown>) => void }) {
  return <form className="studio-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ channel_id: channel?.id, name: String(data.get("name")).trim(), handle: String(data.get("handle") || "").trim(), comic_goal: Number(data.get("comic_goal")), post_goal: Number(data.get("post_goal")) }); }}>
    <label>Channel name<input required name="name" maxLength={60} defaultValue={channel?.name} placeholder="Your channel" /></label><label>YouTube handle <span className="muted">(optional)</span><input name="handle" maxLength={101} pattern="@[A-Za-z0-9_.\-]+" defaultValue={channel?.handle} placeholder="@yourchannel" /><small>Add a handle to include this channel in Site stats.</small></label>
    {!channel && <div className="form-pair"><label>Comics per day<input name="comic_goal" required type="number" min={0} max={50} defaultValue={1} /></label><label>Internet posts per day<input name="post_goal" required type="number" min={0} max={50} defaultValue={0} /></label></div>}
    <button className="primary" disabled={busy}>{busy ? "Saving…" : channel ? "Save channel" : "Add channel"}</button>
  </form>;
}
