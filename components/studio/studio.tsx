"use client";

import { useState, type FormEvent } from "react";
import { AuthPanel } from "./auth-panel";
import { StudioDialog } from "./dialog";
import { ChannelForm, ItemForm } from "./forms";
import { useStudio } from "./use-studio";
import { STAGES, countsFor, dayLabel, goalFor, isFinished, safeLink, shiftDate, torontoDate, weekDays, type Channel, type ContentType, type Item, type Operation, type Snapshot, type Step } from "@/lib/studio/types";

type Modal = { kind: "add"; type: ContentType } | { kind: "details" | "edit"; id: string } | { kind: "goals" | "channel" | "new-channel" | "invite" } | null;
type Tab = "board" | "team" | "activity";

export function Studio() {
  const state = useStudio();
  const [channelId, setChannelId] = useState("");
  const [day, setDay] = useState(torontoDate);
  const [tab, setTab] = useState<Tab>("board");
  const [filter, setFilter] = useState<"all" | ContentType>("all");
  const [modal, setModal] = useState<Modal>(null);
  const [copied, setCopied] = useState(false);
  const { data, busy, actorId } = state;
  const channel = data?.channels.find(c => c.id === channelId) || data?.channels[0];
  const memberName = (id: string | null) => data?.members.find(m => m.user_id === id)?.display_name || "Unassigned";
  const closeModal = () => { setModal(null); state.setError(""); };
  function openModal(value: Modal) { state.setError(""); setCopied(false); setModal(value); }
  async function save(operation: Operation, payload: Record<string, unknown>, close = true) {
    if (await state.mutate(operation, payload)) { if (close) closeModal(); }
  }
  if (!state.authReady) return <div className="studio-loading" role="status">Opening your studio…</div>;
  if ((!state.user && !state.preview) || state.recovery) return <AuthPanel configured={state.configured} onPreview={state.startPreview} recovery={state.recovery} onRecovered={() => state.setRecovery(false)} />;
  if (state.loading && !data) return <div className="studio-loading" role="status">Loading your team’s board…</div>;
  if (!data || !channel) return <WorkspaceSetup busy={busy} error={state.error} hasTeams={state.workspaces.length > 0} onRetry={() => void state.refresh()} onSubmit={state.setup} onSignOut={() => void state.signOut()} />;

  const comics = countsFor(data, channel, day, "comic");
  const posts = countsFor(data, channel, day, "internet_post");
  const items = data.items.filter(i => i.channel_id === channel.id && i.due_date === day);
  const shownItems = items.filter(i => filter === "all" || i.content_type === filter);
  const finished = comics.finished + posts.finished;
  const remaining = comics.remaining + posts.remaining;
  const total = comics.target + posts.target;
  const activeItem = modal && "id" in modal ? data.items.find(i => i.id === modal.id) : undefined;
  const currentGoal = goalFor(data, channel, day);
  const days = weekDays(day);

  return <>
    {state.preview && <div className="preview-banner"><span><strong>Preview only.</strong> Example content. Changes disappear when you leave.</span><button onClick={state.endPreview}>Exit preview</button></div>}
    <div className="studio-shell">
      <aside className="studio-sidebar" aria-label="Workspace">
        <div className="sidebar-heading"><span className="studio-eyebrow">WORKSPACE</span>{state.workspaces.length > 1 ? <select aria-label="Switch team" value={state.teamId} onChange={e => { state.setTeamId(e.target.value); setChannelId(""); setModal(null); }}><option disabled>Select team</option>{state.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select> : <strong>{data.workspace.name}</strong>}</div>
        <div className="channel-label"><span>YOUR CHANNELS</span><button aria-label="Add channel" onClick={() => openModal({ kind: "new-channel" })}>+</button></div>
        <div className="channel-switcher">{data.channels.map((c, index) => <button className={c.id === channel.id ? "selected" : ""} key={c.id} onClick={() => { setChannelId(c.id); setFilter("all"); setModal(null); }} aria-pressed={c.id === channel.id}><span className={`channel-initial channel-color-${index % 3}`}>{c.name.slice(0, 1).toUpperCase()}</span><span><strong>{c.name}</strong><small>{c.comic_goal + c.post_goal} uploads / day by default</small></span>{c.id === channel.id && <i aria-hidden="true">›</i>}</button>)}</div>
        <div className="sidebar-divider" />
        <nav className="studio-tabs" aria-label="Studio views">{([['board', '▦', 'Daily board'], ['team', '◎', 'Team & credits'], ['activity', '≡', 'Activity']] as const).map(([value, icon, label]) => <button key={value} onClick={() => setTab(value)} aria-pressed={tab === value} className={tab === value ? "active" : ""}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
        <div className="sidebar-bottom"><div className="member-identity"><span className="member-avatar">{memberName(actorId).slice(0, 1).toUpperCase()}</span><span><strong>{memberName(actorId)}</strong><small>{actorId === data.workspace.owner_id ? "Team owner" : "Team member"}</small></span></div>{state.preview ? <button className="text-button" onClick={state.endPreview}>Exit preview</button> : <button className="text-button" onClick={() => void state.signOut()}>Sign out</button>}</div>
      </aside>
      <div className="studio-content">
        <div className="studio-topline"><span className="studio-eyebrow">{channel.name} / {tab === "board" ? "PRODUCTION" : tab === "team" ? "CONTRIBUTIONS" : "HISTORY"}</span><span className="sync-status">{state.preview ? "Example workspace" : state.syncFailed ? "Sync paused" : busy ? "Saving…" : state.lastSync ? "Synced · refreshes every 10s" : "Connecting…"}{!state.preview && <button onClick={() => void state.refresh()} aria-label="Refresh board" disabled={busy}>↻</button>}</span></div>
        <div className="studio-title"><div><h1>{tab === "board" ? "Make today count." : tab === "team" ? "Everyone’s part." : "The work, on record."}</h1><p>{tab === "board" ? (total === 0 ? "No uploads planned for this day." : remaining === 0 ? "This day’s targets are covered. Nice work." : `${remaining} more ${remaining === 1 ? "upload" : "uploads"} to finish for this day.`) : tab === "team" ? "Submissions and completed stages, credited to the people behind them." : "A shared history of submissions, changes, and completed work."}</p></div><div className="title-actions"><button className="secondary" onClick={() => openModal({ kind: "channel" })}>Channel settings</button><button className="primary" onClick={() => openModal({ kind: "add", type: "comic" })}><span aria-hidden="true">＋</span> Add submission</button></div></div>
        {state.error && !modal && <div className="studio-error" role="alert">{state.error}<button className="text-button" onClick={() => { state.setError(""); void state.refresh(); }}>Refresh</button></div>}
        <div className="calendar-toolbar"><div><button className="icon-button" aria-label="Previous week" onClick={() => setDay(shiftDate(day, -7))}>‹</button><strong>{dayLabel(days[0], { month: "short", day: "numeric" })} – {dayLabel(days[6], { month: "short", day: "numeric", year: "numeric" })}</strong><button className="icon-button" aria-label="Next week" onClick={() => setDay(shiftDate(day, 7))}>›</button></div><div><button className="text-button" onClick={() => setDay(torontoDate())}>Today</button><input aria-label="Choose date" type="date" value={day} onChange={e => { if (e.target.value) setDay(e.target.value); }} /><span>Toronto time</span></div></div>
        {tab === "board" && <>
          <div className="week-grid" aria-label="Weekly upload progress">{days.map(date => {
            const c = countsFor(data, channel, date, "comic"); const p = countsFor(data, channel, date, "internet_post");
            const done = c.finished + p.finished; const target = c.target + p.target;
            return <button className={`week-day ${date === day ? "selected" : ""} ${target > 0 && !c.remaining && !p.remaining ? "covered" : ""}`} key={date} onClick={() => setDay(date)} aria-pressed={date === day} aria-label={`${dayLabel(date)}: ${c.finished} of ${c.target} comics, ${p.finished} of ${p.target} internet posts finished`}><span>{dayLabel(date, { weekday: "short" })}{date === torontoDate() && <small>Today</small>}</span><strong>{dayLabel(date, { day: "numeric" })}</strong><div className="day-bars"><i><b style={{ width: `${c.target ? Math.min(100, c.finished / c.target * 100) : 0}%` }} /></i><i><b style={{ width: `${p.target ? Math.min(100, p.finished / p.target * 100) : 0}%` }} /></i></div><em>{done}/{target} finished</em></button>;
          })}</div>
          <div className="day-heading"><h2>{dayLabel(day)}</h2><button className="text-button" onClick={() => openModal({ kind: "goals" })}>Edit daily targets</button></div>
          <div className="progress-grid"><ProgressCard type="comic" counts={comics} /><ProgressCard type="internet_post" counts={posts} /><div className="day-summary"><span className="studio-eyebrow">DAILY TOTAL</span><strong>{finished}<small> / {total}</small></strong><span>{remaining === 0 && total > 0 ? "Target covered" : `${remaining} left to finish`}</span><p>Edited items count as finished, including those already scheduled.</p></div></div>
          <div className="board-heading"><div className="filter-tabs" aria-label="Filter submissions">{([['all', 'All submissions'], ['comic', 'Comics'], ['internet_post', 'Internet posts']] as const).map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}{value === "all" && <span>{items.length}</span>}</button>)}</div><span className="board-note">Script → voiceover → edit → schedule</span></div>
          <div className="submission-list">{shownItems.map(item => {
            const steps = data.steps.filter(s => s.item_id === item.id);
            const scheduled = steps.some(s => s.stage === "scheduled" && s.completed_at);
            const ready = isFinished(item, data.steps);
            const completed = steps.filter(s => s.completed_at).length;
            return <button className={`submission-card ${ready ? "finished" : ""}`} key={item.id} onClick={() => openModal({ kind: "details", id: item.id })} aria-label={`Open ${item.title}`}><div className={`submission-type ${item.content_type}`} aria-hidden="true">{item.content_type === "comic" ? "▦" : "≡"}</div><div className="submission-info"><div><span className={`type-badge ${item.content_type}`}>{item.content_type === "comic" ? "Comic" : "Internet post"}</span><span className={`status-badge ${scheduled ? "scheduled" : ready ? "ready" : ""}`}>{scheduled ? "Scheduled" : ready ? "Ready" : completed ? "In progress" : "Needs work"}</span></div><strong>{item.title}</strong><small>Submitted by {memberName(item.submitted_by)}</small></div><div className="stage-preview">{STAGES.map(stage => <span key={stage.id} className={steps.some(s => s.stage === stage.id && s.completed_at) ? "done" : ""}><b>{steps.some(s => s.stage === stage.id && s.completed_at) ? "✓" : "○"}</b>{stage.label}</span>)}</div><span className="open-item" aria-hidden="true">↗</span></button>;
          })}
          {([['comic', comics], ['internet_post', posts]] as const).filter(([type, counts]) => (filter === "all" || filter === type) && counts.unplanned > 0).map(([type, counts]) => <button className="missing-slot" key={type} onClick={() => openModal({ kind: "add", type })}><span className="missing-icon">＋</span><span><strong>{counts.unplanned} {type === "comic" ? counts.unplanned === 1 ? "comic slot" : "comic slots" : counts.unplanned === 1 ? "internet post slot" : "internet post slots"} still empty</strong><small>Add a submission to give this day a plan.</small></span><span className={`type-badge ${type}`}>{type === "comic" ? "Comic" : "Internet post"}</span></button>)}
          {!shownItems.length && !(filter !== "internet_post" && comics.unplanned) && !(filter !== "comic" && posts.unplanned) && <div className="empty-state"><h3>No submissions here yet.</h3><p>Add something you’re working on, or adjust this day’s targets.</p><button className="secondary" onClick={() => openModal({ kind: "add", type: filter === "internet_post" ? filter : "comic" })}>Add submission</button></div>}
          </div>
        </>}
        {tab === "team" && <TeamView data={data} channel={channel} days={days} actorId={actorId} busy={busy} onInvite={() => openModal({ kind: "invite" })} onAccess={(id, active) => void save(active ? "remove_member" : "restore_member", { user_id: id }, false)} />}
        {tab === "activity" && <ActivityView data={data} channelId={channel.id} />}
      </div>
    </div>
    {modal && <StudioDialog title={modal.kind === "add" ? "Add a submission" : modal.kind === "details" ? "Submission details" : modal.kind === "edit" ? "Edit submission" : modal.kind === "goals" ? "Daily targets" : modal.kind === "invite" ? "Invite your crew" : modal.kind === "channel" ? "Channel settings" : "Add a channel"} onClose={closeModal}>
      {state.error && <p className="studio-error" role="alert">{state.error}</p>}
      {modal.kind === "add" && <ItemForm channel={channel} day={day} type={modal.type} busy={busy} onSave={payload => void save("add_item", payload)} />}
      {modal.kind === "edit" && activeItem && <ItemForm item={activeItem} channel={channel} day={day} busy={busy} onSave={payload => void save("edit_item", payload)} onDelete={actorId === data.workspace.owner_id || activeItem.submitted_by === actorId ? () => void save("delete_item", { item_id: activeItem.id, version: activeItem.version }) : undefined} />}
      {modal.kind === "details" && activeItem && <ItemDetails item={activeItem} data={data} actorId={actorId} busy={busy} onEdit={() => openModal({ kind: "edit", id: activeItem.id })} onStep={payload => void save("set_step", payload, false)} />}
      {(modal.kind === "details" || modal.kind === "edit") && !activeItem && <p>This submission was removed. Close this window to refresh the board.</p>}
      {modal.kind === "goals" && <form className="studio-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void save("set_goal", { channel_id: channel.id, day, comic_goal: Number(form.get("comic_goal")), post_goal: Number(form.get("post_goal")) }); }}><p>Targets for {dayLabel(day)}. Other days keep their existing targets.</p><div className="form-pair"><label>Comics<input required type="number" name="comic_goal" min={0} max={50} defaultValue={currentGoal.comic_goal} /></label><label>Internet posts<input required type="number" name="post_goal" min={0} max={50} defaultValue={currentGoal.post_goal} /></label></div><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save targets"}</button></form>}
      {(modal.kind === "channel" || modal.kind === "new-channel") && <ChannelForm channel={modal.kind === "channel" ? channel : undefined} busy={busy} onSave={payload => void save(modal.kind === "channel" ? "edit_channel" : "add_channel", payload)} />}
      {modal.kind === "invite" && <div className="studio-form">{state.preview ? <p>Invites become available when team accounts are connected. This preview doesn’t send invitations.</p> : data.workspace.invite_code ? <><p>Share this code privately. Your friend can create an account, choose “Join a team,” and paste it in.</p><label>Team invite code<input readOnly value={data.workspace.invite_code} onFocus={e => e.target.select()} /></label><button className="primary" onClick={async () => { try { await navigator.clipboard.writeText(data.workspace.invite_code!); setCopied(true); } catch { state.setError("Couldn't copy automatically. Select the code and copy it manually."); } }}>{copied ? "Copied!" : "Copy invite code"}</button><button className="text-button" disabled={busy} onClick={() => { setCopied(false); void save("rotate_invite", {}, false); }}>Replace code</button><small>Replacing the code stops old invites from working. Current members keep access.</small></> : <p>Ask your team owner for the invite code.</p>}</div>}
    </StudioDialog>}
  </>;
}

function WorkspaceSetup({ busy, error, hasTeams, onRetry, onSubmit, onSignOut }: { busy: boolean; error: string; hasTeams: boolean; onRetry: () => void; onSubmit: (mode: "create" | "join", name: string, value: string) => void; onSignOut: () => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit(mode, String(form.get("name")).trim(), String(form.get("value")).trim()); }
  return <div className="setup-card"><p className="studio-eyebrow">LET’S GET THE CREW TOGETHER</p><h1>Your team starts here.</h1><p>Create a shared board, or use an invite code from a friend.</p><div className="filter-tabs"><button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>Create a team</button><button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>Join a team</button></div><form className="studio-form" onSubmit={submit}><label>Your display name<input name="name" required maxLength={40} placeholder="What should your friends call you?" /></label><label>{mode === "create" ? "Team name" : "Invite code"}<input key={mode} name="value" required maxLength={mode === "create" ? 80 : 36} placeholder={mode === "create" ? "The upload crew" : "Paste your team’s code"} /></label>{error && <p className="studio-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "create" ? "Create team" : "Join team"}</button>{mode === "create" && <small>Your board starts with ginduyah (2 comics + 1 internet post daily) and NBA comics (1 comic daily). You can rename channels and adjust targets.</small>}</form>{hasTeams && <button className="text-button" onClick={onRetry}>Retry loading my team</button>}<button className="text-button" onClick={onSignOut}>Sign out</button></div>;
}

function ProgressCard({ type, counts }: { type: ContentType; counts: ReturnType<typeof countsFor> }) {
  return <div className={`progress-card ${type}`}><div className="progress-card-top"><span className={`type-badge ${type}`}>{type === "comic" ? "Comics" : "Internet posts"}</span><span className={counts.remaining ? "remaining" : "muted"}>{counts.remaining ? `${counts.remaining} still needed` : counts.target ? "Target covered ✓" : "No target today"}</span></div><div className="progress-count"><strong>{counts.finished}</strong><span>/ {counts.target} finished</span></div><div className="progress-segments" role="progressbar" aria-label={`${type === "comic" ? "Comics" : "Internet posts"} finished`} aria-valuemin={0} aria-valuemax={counts.target || 1} aria-valuenow={Math.min(counts.finished, counts.target)}>{Array.from({ length: Math.min(counts.target || 1, 10) }, (_, i) => <i key={i} className={counts.target && i < Math.min(counts.finished / counts.target, 1) * Math.min(counts.target, 10) ? "filled" : ""} />)}</div><small>{counts.submitted} submitted · {Math.max(0, counts.submitted - counts.finished)} in progress</small></div>;
}

function ItemDetails({ item, data, actorId, busy, onEdit, onStep }: { item: Item; data: Snapshot; actorId: string; busy: boolean; onEdit: () => void; onStep: (payload: Record<string, unknown>) => void }) {
  const name = (id: string | null) => data.members.find(m => m.user_id === id)?.display_name || "Unassigned";
  const link = safeLink(item.link);
  return <div className="item-details"><span className={`type-badge ${item.content_type}`}>{item.content_type === "comic" ? "Comic" : "Internet post"}</span><h3>{item.title}</h3><p>For {dayLabel(item.due_date)} · Submitted by <strong>{name(item.submitted_by)}</strong></p>{link && <a className="attachment-link" href={link} target="_blank" rel="noopener noreferrer">Open source / file ↗</a>}{item.notes && <p className="item-notes">{item.notes}</p>}<div className="stage-list">{STAGES.map(stage => {
    const step = data.steps.find(s => s.item_id === item.id && s.stage === stage.id) as Step | undefined;
    if (!step) return null;
    const canReopen = !step.completed_at || step.completed_by === actorId || actorId === data.workspace.owner_id;
    return <div className={`stage-row ${step.completed_at ? "complete" : ""}`} key={stage.id}><label className="stage-check"><input type="checkbox" checked={Boolean(step.completed_at)} disabled={busy || !canReopen} onChange={e => onStep({ item_id: item.id, stage: stage.id, version: step.version, done: e.target.checked })} /><span><strong>{stage.label}</strong><small>{step.completed_at ? `Done by ${name(step.completed_by)}` : "Not finished yet"}</small></span></label><label className="stage-assignment"><span>Assigned to</span><select aria-label={`Assign ${stage.label}`} value={step.assigned_to || ""} disabled={busy} onChange={e => onStep({ item_id: item.id, stage: stage.id, version: step.version, assigned_to: e.target.value || null })}><option value="">Unassigned</option>{data.members.filter(m => m.active || m.user_id === step.assigned_to).map(m => <option value={m.user_id} key={m.user_id} disabled={!m.active}>{m.display_name}{m.active ? "" : " (removed)"}</option>)}</select></label></div>;
  })}</div><p className="detail-hint">Tick a stage when you finish it. Completion is credited to your signed-in account. “Scheduled” records your update here; it doesn’t upload to YouTube.</p><button className="secondary" disabled={busy} onClick={onEdit}>Edit title, date, or links</button></div>;
}

function TeamView({ data, channel, days, actorId, busy, onInvite, onAccess }: { data: Snapshot; channel: Channel; days: string[]; actorId: string; busy: boolean; onInvite: () => void; onAccess: (id: string, active: boolean) => void }) {
  const items = data.items.filter(i => i.channel_id === channel.id);
  const withinWeek = (value: string) => { const date = torontoDate(new Date(value)); return date >= days[0] && date <= days[6]; };
  const owner = data.workspace.owner_id === actorId;
  const [confirmMember, setConfirmMember] = useState<string | null>(null);
  return <section className="team-panel"><div className="section-heading"><div><h2>This week’s contributions</h2><p>{channel.name} · based on when work was submitted or completed</p></div><button className="primary" onClick={onInvite}>Invite a friend</button></div><div className="table-wrap"><table><thead><tr><th scope="col">Teammate</th><th scope="col">Submitted</th>{STAGES.map(s => <th scope="col" key={s.id}>{s.label}</th>)}</tr></thead><tbody>{data.members.map(member => <tr key={member.user_id}><th scope="row"><span className="member-avatar">{member.display_name[0].toUpperCase()}</span>{member.display_name}{!member.active && <small> (removed)</small>}</th><td>{items.filter(i => i.submitted_by === member.user_id && withinWeek(i.created_at)).length}</td>{STAGES.map(stage => <td key={stage.id}>{data.steps.filter(s => s.stage === stage.id && s.completed_by === member.user_id && s.completed_at && withinWeek(s.completed_at) && items.some(i => i.id === s.item_id)).length}</td>)}</tr>)}</tbody></table></div>{owner && <div className="team-access"><h3>Team access</h3>{data.members.filter(m => m.user_id !== data.workspace.owner_id).map(m => <div key={m.user_id}><span>{m.display_name} <small>{m.active ? "Member" : "Access removed"}</small></span>{confirmMember === m.user_id ? <span><button className="text-button danger" disabled={busy} onClick={() => { onAccess(m.user_id, m.active); setConfirmMember(null); }}>Confirm removal</button><button className="text-button" onClick={() => setConfirmMember(null)}>Cancel</button></span> : <button className="text-button" disabled={busy} onClick={() => m.active ? setConfirmMember(m.user_id) : onAccess(m.user_id, false)}>{m.active ? "Remove access" : "Restore access"}</button>}</div>)}</div>}</section>;
}

function ActivityView({ data, channelId }: { data: Snapshot; channelId: string }) {
  const entries = data.activity.filter(a => !a.channel_id || a.channel_id === channelId);
  return <section className="activity-panel"><div className="section-heading"><div><h2>Recent activity</h2><p>Latest 200 team updates. Timestamps use Toronto time.</p></div></div>{!entries.length ? <div className="empty-state"><h3>The next move is yours.</h3><p>Add a submission or complete a stage to start the history.</p></div> : <ol className="activity-list">{entries.map(a => <li key={a.id}><span className="member-avatar">{a.actor_name[0].toUpperCase()}</span><div><p><strong>{a.actor_name}</strong> {a.action}{a.stage ? ` ${STAGES.find(s => s.id === a.stage)?.label.toLowerCase()} for` : ""} <strong>{a.title}</strong></p><time dateTime={a.created_at}>{new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(a.created_at))}</time></div></li>)}</ol>}</section>;
}
