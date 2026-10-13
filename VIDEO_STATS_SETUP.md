# Team Studio video insights — setup

The calendar now opens a right-side insights panel when you click a scheduled video. Each channel still has its own calendar; **All Channels** displays both calendars together. Everyone with the existing PIN sees both channels. No new member permissions or accounts are added.

## Turn on public YouTube video statistics

1. Keep the existing `YOUTUBE_API_KEY` Vercel environment variable (already used for channel statistics), or add one with YouTube Data API v3 enabled in Google Cloud.
2. Redeploy the project on Vercel after changing environment variables.
3. In Team Studio, edit a submission and paste its **published YouTube video/Shorts URL** into **Source or finished file link**. If you used that field for a Drive or other source URL, copy that source into Notes first.
4. Open the calendar and click the video. The panel fetches public views, likes and comments, refreshing from YouTube approximately every five minutes. Unpublished entries show an explanatory message instead of invented stats.

## Limitations

YouTube Data API public statistics do **not** include retention, engaged views, average view duration, subscribers gained, traffic sources, or historical graph series. Those require a future OAuth connection to YouTube Analytics for the channel owner. This ZIP deliberately does not fake those metrics or request OAuth credentials. The video link field is shared through the existing studio data; no database migration is required. The original PIN and uploads continue to work.


See `AUTO_YOUTUBE_MATCHING_SETUP.md` for the new no-link workflow.
