import { NextRequest } from "next/server";

const defaults = ["@ginduyah", "@RezaroReads", "@LemurStories"];
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("handles");
  const handles = Array.from(new Set((requested ? requested.split(",") : defaults).map(h => h.trim()).filter(Boolean)));
  if (!handles.length || handles.length > 8 || handles.some(h => !/^@[A-Za-z0-9_.-]{1,100}$/.test(h))) {
    return Response.json({ error: "Choose between one and eight valid YouTube handles." }, { status: 400 });
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Response.json({ error: "Live channel stats aren’t connected yet. The site owner needs to add the YouTube API key." }, { status: 503 });
  const channels = await Promise.all(handles.map(async handle => {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.searchParams.set("part", "snippet,statistics"); url.searchParams.set("forHandle", handle); url.searchParams.set("key", key);
      const response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("YouTube is temporarily unavailable.");
      const json = await response.json();
      const channel = json.items?.[0];
      if (!channel) return { handle, error: "Channel not found. Check its handle." };
      const number = (value: unknown) => value === undefined || value === null || !Number.isFinite(Number(value)) ? null : Number(value);
      return { handle, name: channel.snippet?.title || handle, image: channel.snippet?.thumbnails?.medium?.url || "", views: number(channel.statistics?.viewCount), subscribers: channel.statistics?.hiddenSubscriberCount ? null : number(channel.statistics?.subscriberCount), videos: number(channel.statistics?.videoCount) };
    } catch { return { handle, error: "Couldn't refresh this channel. Try again shortly." }; }
  }));
  return Response.json({ channels, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, max-age=300" } });
}
