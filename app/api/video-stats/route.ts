import { NextRequest, NextResponse } from "next/server";

export const revalidate = 300;
function videoId(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host === "www.youtu.be") return url.pathname.split("/")[1] || null;
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
    return match?.[1] || null;
  } catch { return null; }
}
export async function GET(request: NextRequest) {
  const id = videoId(request.nextUrl.searchParams.get("url") || "");
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return NextResponse.json({ error: "Add a valid YouTube video or Shorts URL to this submission to see its stats." }, { status: 400 });
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({ error: "Set YOUTUBE_API_KEY in Vercel to enable public video stats." }, { status: 503 });
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics,contentDetails");
    url.searchParams.set("id", id);
    url.searchParams.set("key", key);
    const response = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw new Error("YouTube is unavailable right now.");
    const json = await response.json();
    const video = json.items?.[0];
    if (!video) return NextResponse.json({ error: "Video not found or its statistics are private." }, { status: 404 });
    return NextResponse.json({ id, title: video.snippet?.title, channelTitle: video.snippet?.channelTitle, channelId: video.snippet?.channelId, publishedAt: video.snippet?.publishedAt, thumbnail: video.snippet?.thumbnails?.medium?.url, views: video.statistics?.viewCount ?? null, likes: video.statistics?.likeCount ?? null, comments: video.statistics?.commentCount ?? null, url: `https://www.youtube.com/watch?v=${id}` }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch { return NextResponse.json({ error: "Could not load video statistics. Please try again." }, { status: 502 }); }
}
