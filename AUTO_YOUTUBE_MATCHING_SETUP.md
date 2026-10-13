# Automatic YouTube video matching

1. Upload the project to GitHub / Vercel as usual.
2. In Vercel, add the environment variable `YOUTUBE_API_KEY` once (Google Cloud project with YouTube Data API v3 enabled), then redeploy. If it was already configured for video insights, leave it unchanged.
3. In Team Studio, schedule your videos normally with the right channel, planned upload date, and a title close to the published YouTube title. **You do not need to paste a YouTube link.**
4. After the video is public, open its calendar entry. Team Studio searches recent uploads on that channel, matches by title and date, and loads public views, likes and comments. Refresh to retry after publishing.
5. If the match is missing or ambiguous, edit that entry and paste its YouTube URL manually in the existing link field. Move any prior source URL to Notes first.

## Limits
- Matching searches up to the 150 latest uploads on the selected channel and only considers videos within seven days of the scheduled date. Very different titles, older videos, or ambiguous matches need manual linking.
- Matching happens when you open the video insights panel; there is no background scheduled job or saved link. No new database migration or Google account login is required.
- Public stats only. Engaged views, retention, RPM and other private YouTube Studio metrics are not included.
- The same `YOUTUBE_API_KEY` is used for both channels. API quota limits may apply.
