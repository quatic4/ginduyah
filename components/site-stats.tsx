"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getStudioClient } from "@/lib/studio/client";
import type { Snapshot } from "@/lib/studio/types";

type ChannelStats = { handle: string; name?: string; image?: string; views?: number | null; subscribers?: number | null; videos?: number | null; error?: string };
const featured = [{ handle: "@ginduyah", name: "ginduyah" }, { handle: "@RezaroReads", name: "Rezaro" }, { handle: "@LemurStories", name: "LemurStories" }];
const count = (value: number | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-CA").format(value);

export function SiteStats() {
  const [scope, setScope] = useState<"featured" | "team">("featured");
  const [team, setTeam] = useState<{ handle: string; name: string }[]>([]);
  const [teamStatus, setTeamStatus] = useState("Connect shared storage to include the team’s channels.");
  const [stats, setStats] = useState<ChannelStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const requestId = useRef(0);
  const handles = (scope === "featured" ? featured : team).filter(c => c.handle).map(c => c.handle).slice(0, 8).join(",");
  useEffect(() => {
    const client = getStudioClient();
    if (!client) return;
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const snapshot = await client.rpc("studio_shared_snapshot").abortSignal(AbortSignal.timeout(15000));
        if (!active) return;
        if (snapshot.error) throw snapshot.error;
        const channels = (snapshot.data as Snapshot).channels;
        setTeam(channels.map(c => ({ handle: c.handle, name: c.name })));
        setTeamStatus(`${(snapshot.data as Snapshot).workspace.name} · add YouTube handles in Channel settings.`);
      } catch { if (active) setTeamStatus("Couldn't load the team’s latest channels. Try again from Team studio."); }
      finally { pending = false; }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    window.addEventListener("focus", load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, []);
  const loadStats = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setError(""); setStats([]); setCheckedAt("");
    if (!handles) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/site-stats?handles=${encodeURIComponent(handles)}`, { signal });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Stats are temporarily unavailable.");
      if (!signal?.aborted && requestId.current === currentRequest) { setStats(json.channels); setCheckedAt(json.checkedAt); }
    } catch (e) { if (!signal?.aborted && requestId.current === currentRequest) setError(e instanceof Error ? e.message : "Couldn't load stats."); }
    finally { if (!signal?.aborted && requestId.current === currentRequest) setLoading(false); }
  }, [handles]);
  useEffect(() => { const controller = new AbortController(); void loadStats(controller.signal); return () => controller.abort(); }, [loadStats]);
  const selected = scope === "featured" ? featured : team;
  return <>
    <p className="studio-eyebrow">SITE STATS</p><div className="studio-title"><div><h1>The channels behind the stories.</h1><p>The channel stats from the generator, with room for your whole crew.</p></div><button className="secondary" disabled={loading || !handles} onClick={() => void loadStats()}>{loading ? "Refreshing…" : "Refresh stats ↻"}</button></div>
    <div className="stats-toolbar"><div className="filter-tabs"><button className={scope === "featured" ? "active" : ""} aria-pressed={scope === "featured"} onClick={() => setScope("featured")}>Featured channels</button><button className={scope === "team" ? "active" : ""} aria-pressed={scope === "team"} onClick={() => setScope("team")}>My team’s channels</button></div><span>Public YouTube totals · cached for up to 1 hour</span></div>
    {scope === "team" && <p className="stats-team-note">{teamStatus} <Link href="/studio">Open Team studio ↗</Link></p>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    {loading && <p className="stats-loading" role="status">Fetching channel totals…</p>}
    <div className="stats-grid">{selected.map(channel => {
      const stat = stats.find(s => s.handle === channel.handle);
      return <article className="stats-card" key={channel.handle || channel.name}><div className="stats-channel-heading">{stat?.image ? <img src={stat.image} alt="" width={52} height={52} /> : <span className="stats-avatar">{channel.name[0].toUpperCase()}</span>}<div><h2>{stat?.name || channel.name}</h2>{channel.handle && <a href={`https://www.youtube.com/${encodeURIComponent(channel.handle)}`} target="_blank" rel="noopener noreferrer">{channel.handle} ↗</a>}</div></div>{!channel.handle ? <p className="stat-unavailable">Add this channel’s YouTube handle in Channel settings to load its stats.</p> : <><div className="stat-main"><span>Total views</span><strong>{loading ? "…" : count(stat?.views)}</strong></div><div className="stat-pair"><div><span>Subscribers</span><strong>{loading ? "…" : stat && !stat.error && stat.subscribers === null ? "Hidden" : count(stat?.subscribers)}</strong></div><div><span>Public videos</span><strong>{loading ? "…" : count(stat?.videos)}</strong></div></div>{stat?.error && <p className="stat-unavailable">{stat.error}</p>}{!loading && !stat && <p className="stat-unavailable">{error ? "Live data unavailable" : "No data loaded"}</p>}</>}</article>;
    })}</div>
    {scope === "team" && team.length === 0 && <div className="empty-state"><h3>Your channels will appear here.</h3><p>Open Team studio and add a YouTube handle for each channel.</p></div>}
    {checkedAt && <p className="stats-checked">Last checked {new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(checkedAt))} · Toronto time</p>}
    <section className="website-stats"><div><p className="studio-eyebrow">WEBSITE TRAFFIC</p><h2>Visitors, page views & performance</h2><p>The site already sends traffic and speed data to Vercel. Those private reports are available to the site owner.</p></div><div><a className="secondary" href="https://vercel.com/444-6ee9/ginduyah/analytics" target="_blank" rel="noopener noreferrer">Open website analytics ↗</a><a className="text-button" href="https://vercel.com/444-6ee9/ginduyah/speed-insights" target="_blank" rel="noopener noreferrer">View speed insights ↗</a></div></section>
  </>;
}
