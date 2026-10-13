"use client";
import { useEffect, useState } from "react";
import type { Item, Channel } from "@/lib/studio/types";

type Stats = { id: string; title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; thumbnail?: string; views: string | null; likes: string | null; comments: string | null; url: string };
const fmt = (value: string | null) => value == null ? "—" : Number(value).toLocaleString("en-CA");
export function VideoStats({ item, channel, onClose, onEdit }: { item: Item; channel: Channel; onClose: () => void; onEdit: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [matchNote, setMatchNote] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setStats(null);
    async function resolveVideo() {
      const existing = item.link || "";
      if (/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(existing)) return existing;
      setMatchNote("Looking for this video on YouTube…");
      const query = new URLSearchParams({channel: channel.handle, title:item.title, date:item.due_date});
      const response = await fetch(`/api/video-match?${query}`, {signal:controller.signal});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to match video");
      if (!data.match) throw new Error(data.message || "No confident video match found");
      setMatchNote(`Automatically matched: ${data.match.title}`);
      return data.match.url as string;
    }
    resolveVideo().then(url => fetch(`/api/video-stats?url=${encodeURIComponent(url)}`, { signal: controller.signal }))
      .then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.error || "Unable to load stats"); return json as Stats; })
      .then(setStats).catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [item.id, item.link, item.title, item.due_date, channel.handle, refresh]);
  return <div className="video-stats-backdrop" onClick={onClose}>
    <aside className="video-stats-panel" role="dialog" aria-modal="true" aria-label={`Video statistics for ${item.title}`} onClick={event => event.stopPropagation()}>
      <div className="video-stats-header"><div><small>VIDEO INSIGHTS · {channel.handle || channel.name}</small><h2>{item.title}</h2></div><button className="icon-button" aria-label="Close video statistics" onClick={onClose}>×</button></div>
      <p className="video-stats-meta">{item.content_type === "comic" ? "Comic" : "Internet post"} · Planned {item.due_date}</p>
      {loading && <p role="status">{matchNote || "Loading YouTube statistics…"}</p>}
      {stats && matchNote && <p className="video-stats-meta">{matchNote}</p>}
      {!loading && error && <div className="video-stats-empty"><p>{error}</p><p>Team Studio tries to match the published video automatically using its title, date, and channel. If the title is different or multiple videos are similar, you can manually add the YouTube link in the submission’s link field. Keep any existing source link in Notes first.</p><button className="primary" onClick={onEdit}>Edit submission</button></div>}
      {stats && <><div className="video-stats-preview">{stats.thumbnail && <img src={stats.thumbnail} alt="YouTube video thumbnail" />}<div><strong>{stats.title || item.title}</strong><small>{stats.channelTitle}</small><small>{stats.publishedAt ? `Published ${new Date(stats.publishedAt).toLocaleDateString("en-CA")}` : "Published video"}</small></div></div><div className="video-stats-grid"><div><small>Views</small><strong>{fmt(stats.views)}</strong></div><div><small>Likes</small><strong>{fmt(stats.likes)}</strong></div><div><small>Comments</small><strong>{fmt(stats.comments)}</strong></div></div><div className="video-stats-private"><h3>Advanced analytics</h3><p>Engaged views, retention, average view duration, subscribers gained, traffic sources and historical graphs require a separate authorized YouTube Analytics connection. They aren’t available through the public video API.</p></div><a className="primary video-stats-youtube" href={stats.url} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a></>}
      <div className="video-stats-footer"><button className="secondary" onClick={() => setRefresh(x => x + 1)}>Refresh stats</button><button className="secondary" onClick={onEdit}>Edit submission</button></div>
    </aside>
  </div>;
}
