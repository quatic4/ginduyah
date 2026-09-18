import { featuredChannels, type ChannelStats } from "./channels";

const number = (value: unknown) => value === undefined || value === null || !Number.isFinite(Number(value)) ? null : Number(value);

export async function loadChannelStats(key: string): Promise<ChannelStats[]> {
  return Promise.all(featuredChannels.map(async ({ handle, name }) => {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/channels");
      url.searchParams.set("part", "snippet,statistics");
      url.searchParams.set("forHandle", handle);
      url.searchParams.set("key", key);
      const response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("YouTube unavailable");
      const json = await response.json();
      const channel = json.items?.[0];
      if (!channel) return { handle, name, error: "This channel’s stats are currently unavailable." };
      return {
        handle, name: channel.snippet?.title || name,
        image: channel.snippet?.thumbnails?.medium?.url || "",
        views: number(channel.statistics?.viewCount),
        subscribers: channel.statistics?.hiddenSubscriberCount ? null : number(channel.statistics?.subscriberCount),
        videos: number(channel.statistics?.videoCount),
      };
    } catch { return { handle, name, error: "Couldn't refresh this channel. Try again shortly." }; }
  }));
}

export async function channelCardsResponse() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Response.json({ error: "YouTube API is not configured." }, { status: 503 });
  const stats = await loadChannelStats(key);
  const channels = featuredChannels.map((channel, index) => {
    const stat = stats[index];
    return {
      ...channel, name: stat.name, image: stat.image || channel.image,
      views: stat.views === null || stat.views === undefined ? "View channel" : `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(stat.views)} views`,
    };
  });
  return Response.json({ channels }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" } });
}
