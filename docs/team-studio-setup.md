# Shared team studio setup

The generator stays at `/`; the shared board is at `/studio` and channel stats at `/stats`.

## Connect shared storage

1. Create or select the intended Supabase project. In its SQL editor, run `supabase/migrations/20260917214744_shared_studio_without_accounts.sql` once. This new migration works independently; the older account-based migration is not required for a fresh setup. It creates a shared board with ginduyah (2 comics + 1 internet post daily), NBA comics (1 comic daily), and a renameable `Quatic` roster entry. It does not alter or expose any older private studio data.
2. On the **existing ginduyah Vercel project**, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the environments that should use this board. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted. Use a publishable/anon key, never a service-role or secret key. Keep Supabase's Data API enabled with `public` exposed; leave the internal `shared_studio` schema unexposed.
3. Redeploy after adding these variables because Next.js includes them at build time. Open `/studio`, choose **Quatic** under **Working as**, and use **Manage team** to add your friends' names or rename the starter entry. Share the same site URL with them. No sign-up, email, password, invite code, or Supabase Auth configuration is needed.

If Preview and Production use the same Supabase project, they share the same board, including all edits. Use a separate Supabase project for disposable testing if needed.

## Access and team members

This is intentionally an open shared board: anyone with the site link can read and edit submissions, change targets and channels, and add, rename, remove, or restore roster entries. Name selection is a credit label, not verified identity or owner authorization. It is not suitable for secrets or private personal information.

Names have stable IDs, so renaming someone keeps their submissions and stage credits attached to them. Removal hides the name from the picker and clears their unfinished assignments; previous completed work and history remain. Removed names can be restored. At least one active member must remain. Removal is not an access ban: without accounts, that visitor can still choose another active name.

Only the selected name is stored in the browser. All board data is saved in Supabase, not localStorage or a Vercel server's temporary filesystem. Reloading or opening the site on another device reads the saved board. Existing tabs refresh every 5 seconds while visible, and on focus, visibility change, or reconnection. The UI shows saving, saved, and connection failure states. It does not promise to save offline changes.

## Changes and credit

- Each submission records channel, upload date, type, title, optional link and notes, and selected submitter name.
- Script, voiceover, edit, and scheduling each have an assignee and a completion credit. The name selected when checking a stage receives the credit.
- A finished edit counts once, including when it is scheduled. Scheduling here records progress; it does not upload to YouTube.
- Ready/scheduled submissions credit existing completed stages to the selected name. Earlier script/voiceover work is not invented.
- Comic and internet-post targets are counted separately. Daily target edits affect only the chosen date.
- All database changes are atomic. Record versions protect submissions, stages, members, channel settings, and daily targets from stale forms. Close and reopen an outdated form to get the latest version.
- A shared revision prevents older responses from replacing newer saved board data. Requests are not retried automatically after an uncertain save; refresh to check before retrying.
- Toronto time determines board dates and weekly submission/completion credits. Activity retains the names used when events happened and shows the latest 200 changes.

## Stats

`/stats` loads the same shared channel list without accounts. Public YouTube totals use the existing server-only `YOUTUBE_API_KEY` and may be cached for an hour. Add handles in Channel settings. Website Analytics and Speed Insights remain links to the private Vercel reports.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run lint
pnpm run build
```

Tests run the actual migrations in PostgreSQL via PGlite. They check no-account access, direct-table denial, persistent data after reopening the database, independent viewer reads, roster changes and retained credits, stale edits, stage rules, channel separation, target counts, and date boundaries. The older authenticated schema is also tested alongside the new migration so existing private data remains isolated.

After deployment, open two separate browser sessions without signing in. Select different names; add and edit submissions, complete a stage, rename/remove/restore a member, and change a daily target. Confirm the other view updates within 5 seconds and a fresh reload still shows saved data. Try editing the same submission from both sessions; the stale form must reject its save. Check the interface at desktop and phone widths, plus generator/stats navigation.

Before shared storage is configured, **Try with example content** is a clearly marked temporary demo. It does not save or synchronize and never becomes real team data automatically. Local database tests and a successful build do not replace the hosted two-browser check.
