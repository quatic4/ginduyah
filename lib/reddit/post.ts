export type ImportedStory = { title: string; body: string; author: string; subreddit: string; score: number; comments: number };
export type ImportedComment = { id: string; author: string; body: string; score: number; depth: number; selected: boolean };
export type ImportedPost = { post: ImportedStory; replies: ImportedComment[] };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const children = (value: unknown): unknown[] => { const items = record(record(value).data).children; return Array.isArray(items) ? items : []; };
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export function parseRedditPost(payload: unknown): ImportedPost {
  const listing = Array.isArray(payload) ? payload[0] : payload;
  const data = record(record(children(listing)[0]).data);
  const post = typeof data.title === "string" ? data : record(listing);
  if (typeof post.title !== "string" || !post.title.trim()) throw new Error("No readable Reddit post was found. Check the post link or paste its text.");
  const replies: ImportedComment[] = [];
  const ids = new Set<string>();
  function walk(items: unknown[], depth = 0) {
    if (depth > 20) return;
    for (const child of items) {
      if (replies.length >= 300) break;
      const value = record(child), comment = record(value.data);
      if (value.kind === "more" || typeof comment.body !== "string") continue;
      if (!["[deleted]", "[removed]"].includes(comment.body)) {
        const id = String(comment.id || `comment-${replies.length}`);
        if (!ids.has(id)) {
          ids.add(id);
          replies.push({ id, author: String(comment.author || "anonymous"), body: comment.body, score: number(comment.score), depth, selected: false });
        }
      }
      walk(children(comment.replies), depth + 1);
    }
  }
  if (Array.isArray(payload)) walk(children(payload[1]));
  return { post: { title: post.title, body: String(post.selftext || ""), author: String(post.author || "anonymous"), subreddit: String(post.subreddit || "reddit"), score: number(post.score), comments: number(post.num_comments) }, replies };
}
export function redditUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Paste a Reddit post link, including https://."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || !["reddit.com", "www.reddit.com", "old.reddit.com", "m.reddit.com", "np.reddit.com", "redd.it", "www.redd.it"].includes(url.hostname.toLowerCase())) throw new Error("Only Reddit post links are supported.");
  url.protocol = "https:"; url.hash = ""; url.search = "";
  return url;
}
export function redditPostId(url: URL): string | null {
  const path = url.pathname.replace(/\.json\/?$/i, "").replace(/\/+$/, "");
  const match = /^(?:\/r\/[^/]+)?\/comments\/([a-z0-9]+)(?:\/|$)/i.exec(path);
  if (match) return match[1].toLowerCase();
  if (["redd.it", "www.redd.it"].includes(url.hostname) && /^\/[a-z0-9]+$/i.test(path)) return path.slice(1).toLowerCase();
  return null;
}
export function redditJsonUrl(input: string): string | null {
  try { const id = redditPostId(redditUrl(input)); return id ? `https://www.reddit.com/comments/${id}.json?raw_json=1` : null; } catch { return null; }
}
