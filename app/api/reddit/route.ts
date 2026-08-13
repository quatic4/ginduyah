import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") || "";
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return NextResponse.json({ error: "That URL could not be read." }, { status: 400 }); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!["reddit.com", "old.reddit.com", "redd.it"].includes(host)) return NextResponse.json({ error: "Only Reddit post links are supported." }, { status: 400 });
  parsed.search = ""; parsed.hash = ""; parsed.pathname = parsed.pathname.replace(/\/$/, "") + ".json";
  try {
    const upstream = await fetch(parsed.toString(), { headers: { "User-Agent": "Ginduyah/1.0 (local story card maker)", Accept: "application/json" }, redirect: "follow" });
    if (!upstream.ok) throw new Error(`Reddit returned ${upstream.status}`);
    const payload = await upstream.json() as Array<{ data?: { children?: Array<{ data?: Record<string, unknown> }> } }>;
    if (request.nextUrl.searchParams.get("raw") === "1") return NextResponse.json(payload);
    const post = payload?.[0]?.data?.children?.[0]?.data;
    if (!post) throw new Error("No post was found at that URL");
    return NextResponse.json({ title: String(post.title || ""), body: String(post.selftext || ""), author: String(post.author || "anonymous"), subreddit: String(post.subreddit || "reddit"), score: Number(post.score || 0), comments: Number(post.num_comments || 0) });
  } catch (error) {
    return NextResponse.json({ error: `${error instanceof Error ? error.message : "Reddit blocked the request"}. Reddit sometimes limits automated access; paste the post text into the editable fields instead.` }, { status: 502 });
  }
}
