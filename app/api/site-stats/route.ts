import { loadChannelStats } from "@/lib/youtube";

export async function GET() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Response.json({ error: "Live channel stats aren’t connected yet. The site owner needs to add the YouTube API key." }, { status: 503 });
  const channels = await loadChannelStats(key);
  return Response.json({ channels, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, max-age=300" } });
}
