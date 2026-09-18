// One list for the homepage, stats page, and every public channel endpoint.
export const featuredChannels = [
  { name: "ginduyah", handle: "@ginduyah", url: "https://www.youtube.com/@ginduyah", views: "View channel", image: "/channel-avatar.svg" },
  { name: "GleebyReads", handle: "@gleebyreads", url: "https://www.youtube.com/@gleebyreads", views: "View channel", image: "/channel-avatar.svg" },
];

export type ChannelStats = {
  handle: string;
  name: string;
  image?: string;
  views?: number | null;
  subscribers?: number | null;
  videos?: number | null;
  error?: string;
};
