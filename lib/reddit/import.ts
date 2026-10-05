import { parseRedditPost, redditPostId, redditUrl } from "./post";
export class RedditImportError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
type Config = { clientId?: string; clientSecret?: string; userAgent?: string; refreshToken?: string };
type Fetch = typeof fetch;
// Only the short-lived OAuth token is cached. Post text is never persisted here.
export function createRedditImporter(config: Config, fetcher: Fetch = fetch) {
  let cached: { token: string; until: number } | undefined;
  let pending: Promise<string> | undefined;
  let pauseUntil = 0;
  async function request(url: string, init: RequestInit = {}) {
    const response = await fetcher(url, { ...init, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      pauseUntil = Date.now() + Math.min(300, Math.max(10, Number.isFinite(seconds) ? seconds : 60)) * 1000;
      throw new RedditImportError("Reddit is limiting imports. Wait a minute, then try again.", 429);
    }
    return response;
  }
  async function json(response: Response) {
    const reader = response.body?.getReader();
    if (!reader) throw new RedditImportError("Reddit returned an empty response.");
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 2_000_000) { await reader.cancel(); throw new RedditImportError("This post is too large to import. Paste the part you need instead."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RedditImportError("Reddit did not return readable post data. Try again later."); }
  }
  async function token() {
    if (cached && cached.until > Date.now()) return cached.token;
    if (pending) return pending;
    pending = (async () => {
      const body = config.refreshToken
        ? new URLSearchParams({ grant_type: "refresh_token", refresh_token: config.refreshToken })
        : new URLSearchParams({ grant_type: "https://oauth.reddit.com/grants/installed_client", device_id: "DO_NOT_TRACK_THIS_DEVICE" });
      const response = await request("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": config.userAgent! }, body });
      if (!response.ok) throw new RedditImportError("The site's Reddit connection needs attention. You can paste the post text below.", 503);
      const data = await json(response);
      if (typeof data.access_token !== "string" || !data.access_token) throw new RedditImportError("The site's Reddit connection could not be opened.", 503);
      cached = { token: data.access_token, until: Date.now() + Math.max(0, Math.min(Number(data.expires_in) || 0, 3600) - 60) * 1000 };
      return cached.token;
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  return async (input: string) => {
    let url: URL;
    try { url = redditUrl(input); } catch (error) { throw new RedditImportError((error as Error).message, 400); }
    if (!config.clientId || !config.clientSecret || !config.userAgent) throw new RedditImportError("Automatic Reddit import isn't connected yet. For now, copy the post text from Reddit and paste it into Title and Story below.", 503);
    if (Date.now() < pauseUntil) throw new RedditImportError("Reddit is limiting imports. Wait a minute, then try again.", 429);
    let id = redditPostId(url);
    if (!id && !/^\/(?:r\/[^/]+\/)?s\/[a-z0-9]+\/?$/i.test(url.pathname)) throw new RedditImportError("Use a link to an individual Reddit post or its Share link.", 400);
    // Share links are resolved without credentials; each redirect is checked.
    for (let hop = 0; !id && hop < 4; hop++) {
      const response = await request(url.href, { headers: { "User-Agent": config.userAgent } });
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
      try { url = redditUrl(new URL(location, url).href); } catch { throw new RedditImportError("That Share link could not be resolved safely. Copy the full Reddit post link instead.", 400); }
      id = redditPostId(url);
    }
    if (!id) throw new RedditImportError("Reddit couldn't open that Share link. Open the post in your browser and copy its full link, or paste the text below.", 422);
    const accessToken = await token();
    const response = await request(`https://oauth.reddit.com/comments/${id}?raw_json=1&limit=100&depth=10`, { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": config.userAgent, Accept: "application/json" } });
    if (response.status === 401) { cached = undefined; throw new RedditImportError("The Reddit connection expired. Try the import again.", 503); }
    if (response.status === 403) throw new RedditImportError("Reddit denied access to this post. It may be private or restricted, or the site's API access needs approval. You can paste the text below.", 403);
    if (response.status === 404) throw new RedditImportError("That Reddit post wasn't found. Check the link or paste its text.", 404);
    if (!response.ok) throw new RedditImportError("Reddit couldn't load this post right now. Try again later or paste the text below.");
    return parseRedditPost(await json(response));
  };
}
