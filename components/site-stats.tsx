"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { featuredChannels, type ChannelStats } from "@/lib/channels";

const count = (value: number | null | undefined) => value === null || value === undefined ? "—" : new Intl.NumberFormat("en-CA").format(value);

export function SiteStats() {
  const [stats, setStats] = useState<ChannelStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const requestId = useRef(0);
  const loadStats = useCallback(async (signal?: AbortSignal) => {
    const request = ++requestId.current;
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/site-stats", { signal, cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Stats are temporarily unavailable.");
      if (!signal?.aborted && requestId.current === request) { setStats(json.channels); setCheckedAt(json.checkedAt); }
    } catch (e) {
      if (!signal?.aborted && requestId.current === request) setError(e instanceof Error ? e.message : "Couldn't load stats.");
    } finally { if (!signal?.aborted && requestId.current === request) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadStats(controller.signal);
    return () => { requestId.current++; controller.abort(); };
  }, [loadStats]);

  return <>
    <p className="studio-eyebrow">SITE STATS</p>
    <div className="studio-title"><div><h1>The channels behind the stories.</h1><p>@ginduyah &amp; @gleebyreads, in numbers.</p></div><button className="secondary" disabled={loading} onClick={() => void loadStats()}>{loading ? "Refreshing…" : "Refresh stats ↻"}</button></div>
    <div className="stats-toolbar"><span>Public YouTube totals · cached for up to 1 hour</span></div>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {loading && <p className="stats-loading" role="status">Fetching channel totals…</p>}
    <div className="stats-grid">{featuredChannels.map(channel => {
      const stat = stats.find(s => s.handle === channel.handle);
      return <article className="stats-card" key={channel.handle}>
        <div className="stats-channel-heading">{stat?.image ? <img src={stat.image} alt="" width={52} height={52} /> : <span className="stats-avatar">{channel.name[0].toUpperCase()}</span>}<div><h2>{stat?.name || channel.name}</h2><a href={channel.url} target="_blank" rel="noopener noreferrer">{channel.handle} ↗</a></div></div>
        <div className="stat-main"><span>Total views</span><strong>{loading && !stat ? "…" : count(stat?.views)}</strong></div>
        <div className="stat-pair"><div><span>Subscribers</span><strong>{loading && !stat ? "…" : stat && !stat.error && stat.subscribers === null ? "Hidden" : count(stat?.subscribers)}</strong></div><div><span>Public videos</span><strong>{loading && !stat ? "…" : count(stat?.videos)}</strong></div></div>
        {stat?.error && <p className="stat-unavailable">{stat.error}</p>}
        {!loading && !stat && <p className="stat-unavailable">{error ? "Live data unavailable" : "No data loaded"}</p>}
      </article>;
    })}</div>
    {checkedAt && <p className="stats-checked">Last checked {new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(checkedAt))} · Toronto time</p>}
  </>;
}
