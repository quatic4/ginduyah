# Team studio setup

The existing Reddit generator remains at `/`. New navigation opens `/studio` and `/stats`.

## Connect the shared workspace

1. Open the **existing ginduyah project** in Vercel. Connect a Supabase project through Storage / Marketplace, or use an existing Supabase project. Do not create a replacement Vercel project.
2. In that Supabase project's SQL editor, run `supabase/migrations/202609170001_team_studio.sql` once. It creates new, prefixed tables and functions without touching existing data.
3. Set these variables on the ginduyah Vercel project for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted)
4. In Supabase Auth, enable email/password sign-ins. Set the Site URL to the production origin and allow the production `/studio` URL and the intended preview `/studio` URL as redirects. Keep email verification enabled. Configure the email service for your team before inviting people; Supabase's default email service may restrict recipients.
5. Redeploy. These public environment variables are included at build time. Never expose a Supabase service-role or secret key in a `NEXT_PUBLIC_` variable.
6. Create your account, verify your email, and create your team. It starts with ginduyah (2 comics + 1 internet post daily) and NBA comics (1 comic daily).
7. Open **Team & credits → Invite a friend** and privately share the code. Friends create their own accounts, then choose **Join a team**. The owner can rotate the code or remove/restore members. Removing someone also rotates the code and preserves their previous credits.

## What the board records

- Each upload has a channel, intended upload date, type, title, optional source/file link, notes, and its authenticated submitter.
- Script, voiceover, edit, and scheduling each have an assignee and a separate completion credit. The person who checks the stage gets the credit.
- A finished edit counts as one finished upload. Scheduling the same item never counts it twice. Marking it scheduled only records the status; it does not publish anything to YouTube.
- Existing completed work can be submitted as ready or scheduled. Those completion records are attributed to the submitting account; prior script/voiceover work is not invented.
- Blue means comic; purple means internet post. Each type must meet its own target. Extra comics do not fill missing internet-post slots.
- Daily target edits only affect the selected day. New channels can choose their daily defaults at creation. Channel names and YouTube handles can be edited later.
- Boards refresh every 10 seconds while visible and when a tab regains focus. Version checks prevent two people from silently overwriting the same item or stage.
- Dates and credit totals use America/Toronto. Weekly credit totals count the actual submission/completion date, not the scheduled upload date. Recent activity shows the latest 200 team updates.

## Stats

`/stats` reads public YouTube views, subscriber totals, and video totals using the existing server-only `YOUTUBE_API_KEY`. Add each team's YouTube handles in Channel settings. API responses may be cached for up to an hour. An unavailable API shows a clear message and dashes, not invented totals. Website traffic and performance link to the existing private Vercel Analytics and Speed Insights reports; their numbers are not duplicated into the public page.

## Preview and verification

Before configuration, the sign-in page explains that team accounts are not connected. **Try the board with example content** is an explicit in-memory preview. It does not sign anyone in, synchronize data, send invitations, or save changes across reloads. It is never promoted into a real workspace automatically.

Run:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run lint
pnpm run build
```

The database tests apply the production migration to an isolated PostgreSQL engine (PGlite), with only Supabase's auth identity function and user table supplied as fixtures. They check anonymous and outsider access, joining, immutable actor attribution, owner-only actions, concurrent-edit conflicts, separate channels, target changes, membership revocation, safe links, deletion history, Toronto dates, and counting scheduled content once. They do not claim to verify Supabase's email delivery, hosted auth, or production configuration. Those require a connected project and two real test accounts before release.

Browser release check: at desktop and phone widths, add/edit a submission, switch channels and dates, complete/reopen stages, verify counts and activity, inspect team credits, and verify stats and generator navigation. Then test two real accounts in separate browsers: join the same team, submit from each, confirm cross-device refresh, and remove one member to verify access is denied.
