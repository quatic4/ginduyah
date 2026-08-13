const channels = [
  { handle: "@ginduyah", url: "https://www.youtube.com/@ginduyah" },
  { handle: "@RezaroReads", url: "https://www.youtube.com/@RezaroReads" },
  { handle: "@LemurStories", url: "https://www.youtube.com/@LemurStories" },
];

type YouTubeChannel = {
  snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> };
  statistics?: { viewCount?: string };
};

export const revalidate = 3600;

function formatViews(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export async function GET() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return Response.json({ error: "YouTube API is not configured." }, { status: 503 });

  try {
    const results = await Promise.all(channels.map(async (channel) => {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/channels");
      endpoint.searchParams.set("part", "snippet,statistics");
      endpoint.searchParams.set("forHandle", channel.handle);
      endpoint.searchParams.set("key", apiKey);

      const response = await fetch(endpoint, { next: { revalidate: 3600 } });
      if (!response.ok) throw new Error(`YouTube request failed: ${response.status}`);

      const payload = await response.json() as { items?: YouTubeChannel[] };
      const item = payload.items?.[0];
      if (!item) throw new Error(`Channel not found: ${channel.handle}`);

      const viewCount = Number(item.statistics?.viewCount || 0);
      const thumbnails = item.snippet?.thumbnails || {};
      return {
        name: item.snippet?.title || channel.handle.slice(1),
        handle: channel.handle,
        url: channel.url,
        views: viewCount ? `${formatViews(viewCount)} views` : "No public views yet",
        image: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "",
      };
    }));

    return Response.json({ channels: results }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("YouTube channel refresh failed", error);
    return Response.json({ error: "Unable to refresh YouTube channels." }, { status: 502 });
  }
}
