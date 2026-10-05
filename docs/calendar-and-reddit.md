# Calendar and automatic Reddit imports

## Team Studio

Calendar is the default Studio view. Switch channels in the sidebar, move between
weeks, or choose a date. Clicking a date opens its daily board. Clicking an empty
slot opens a submission with that date and suggested time filled in. Existing
entries have no confirmed time until someone edits them. All times are Toronto
time, including daylight saving changes.

For @ginduyah, suggested slots are 11 AM comic, 4 PM internet post and 9 PM comic.
Other channels and extra daily targets have no assumed time. Times are editable;
two submissions for one channel cannot occupy the same date and exact time.
Leave the time blank when unknown. Discord links still work as source/file links.
This calendar records the team's scheduling; it does not upload to YouTube.

The days-ahead counter counts consecutive fully scheduled target days starting
tomorrow, stopping at the first shortage, within a 30-day window. Today appears
separately. A completed edit (Ready) does not count until marked Scheduled.
Extra comics cannot fill an internet-post target or cover a different date.
Zero-target dates are skipped. Each channel and content type is counted separately.
Time-unknown entries count by their saved date and type, as stated in the UI.

Migration `20261005181755_studio_calendar_times.sql` adds optional upload times.
It preserves existing records and PIN permissions, and supports old client
payloads. It has already been applied to the connected ginduyah-studio project.
No new calendar environment variables are needed. The existing team PIN remains.

## Reddit import connection

Mobile flow: Reddit Share → Copy link → paste into the generator → Import post.
The server retrieves the post and available comments together. Comments remain
optional and selectable. Large threads may be partial; deleted/removed comments
are excluded. Normal, old/mobile, redd.it and resolvable Reddit Share links work.
If Reddit blocks Share-link resolution, use the full post link from the browser.

Automatic import requires approved Reddit Data API access. It is not enabled by
this code update alone. In Vercel project settings, add these server-only
variables to Production and Preview, then redeploy:

- REDDIT_CLIENT_ID: your approved Reddit application's client ID.
- REDDIT_CLIENT_SECRET: its client secret.
- REDDIT_USER_AGENT: a truthful identifier such as
  `web:com.ginduyah.generator:v2 (by /u/YOUR_REDDIT_USERNAME)`.
- REDDIT_REFRESH_TOKEN: optional; use only if your approved integration supplies
  an authorized refresh token with read access. Without it the server requests
  an application-only token for logged-out use with DO_NOT_TRACK_THIS_DEVICE.

Do not put these credentials in the browser or prefix them with NEXT_PUBLIC_.
Do not paste credentials into chat. Request access using Reddit's current
application process before configuring the integration:
https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data
https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
OAuth flow reference (linked from current Reddit guidance):
https://github.com/reddit-archive/reddit/wiki/OAuth2#application-only-oauth

The importer stops on access denials and rate limits. It never uses a proxy to
bypass Reddit restrictions. Credentials are sent only to fixed Reddit OAuth
endpoints, share-link redirects are checked, and response sizes/timeouts are
bounded. Post data is not cached or stored on the server. Only the expiring
OAuth token is held in server memory.

Until connected, the generator explains the missing connection and lets mobile
users paste plain text directly into Title and Story. Copied JSON remains an
advanced optional import. A live Reddit import must be checked after credentials
are configured; local tests use mocked upstream responses.

## Validation

Run `pnpm lint`, `pnpm test`, and `pnpm build`. Tests cover existing shared board
and PIN behavior, coverage gaps, targets and date boundaries, upload-time
migration/permissions/conflicts, Reddit parsing, OAuth, safe redirects and errors.
