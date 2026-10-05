import { NextRequest, NextResponse } from "next/server";
import { createRedditImporter, RedditImportError } from "@/lib/reddit/import";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const importPost = createRedditImporter({ clientId: process.env.REDDIT_CLIENT_ID, clientSecret: process.env.REDDIT_CLIENT_SECRET, userAgent: process.env.REDDIT_USER_AGENT, refreshToken: process.env.REDDIT_REFRESH_TOKEN });
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const result = await importPost(request.nextUrl.searchParams.get("url") || "");
    return NextResponse.json(result, { headers });
  } catch (error) {
    const known = error instanceof RedditImportError;
    return NextResponse.json({ error: known ? error.message : "Reddit took too long or returned unreadable data. Try again, or paste the post text below." }, { status: known ? error.status : 502, headers });
  }
}
