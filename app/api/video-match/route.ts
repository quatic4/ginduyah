import { NextRequest, NextResponse } from 'next/server';
import { matchVideo, type Candidate } from '@/lib/studio/youtube-match';

const handles = new Set(['@ginduyah', '@gleebyreads']);
async function youtube(path: string, params: Record<string,string>, key: string) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k,v] of Object.entries({ ...params, key })) url.searchParams.set(k,v);
  const response = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error('YouTube could not be reached. Check your API key and quota.');
  return response.json();
}
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const handle = (searchParams.get('channel') || '').toLowerCase();
  const title = (searchParams.get('title') || '').trim().slice(0,200);
  const date = searchParams.get('date') || '';
  if (!handles.has(handle) || !title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({error:'Invalid channel, title, or date.'},{status:400});
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({error:'Set YOUTUBE_API_KEY in Vercel once to enable matching.'},{status:503});
  try {
    const channels = await youtube('channels', {part:'contentDetails',forHandle:handle},key);
    const playlist = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlist) return NextResponse.json({error:'YouTube channel uploads could not be found.'},{status:404});
    const candidates: Candidate[] = [];
    let token: string | undefined;
    // At most 150 recent uploads, so requests stay inexpensive and predictable.
    for (let page=0; page<3; page++) {
      const data = await youtube('playlistItems',{part:'snippet',playlistId:playlist,maxResults:'50',...(token?{pageToken:token}:{})},key);
      for (const entry of data.items || []) {
        const snippet = entry.snippet;
        const id = snippet?.resourceId?.videoId;
        if (id && snippet?.title && snippet?.publishedAt && snippet.title !== 'Private video' && snippet.title !== 'Deleted video') {
          candidates.push({id,title:snippet.title,publishedAt:snippet.publishedAt,thumbnail:snippet.thumbnails?.medium?.url});
        }
      }
      token = data.nextPageToken;
      if (!token) break;
    }
    const match = matchVideo(candidates,title,date);
    return NextResponse.json({match:match ? {...match,url:`https://www.youtube.com/watch?v=${match.id}`} : null, message:match ? undefined : 'No confident match found. Check the title/date or add the video link manually.'},{headers:{'Cache-Control':'private, max-age=300'}});
  } catch (e) {return NextResponse.json({error:e instanceof Error?e.message:'YouTube matching is unavailable.'},{status:502});}
}
