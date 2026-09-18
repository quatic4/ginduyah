# Shared team studio setup

The generator stays at `/`; the shared board is at `/studio` and channel stats at `/stats`.

## Connect shared storage

1. Create or select the intended Supabase project. In its SQL editor, run `supabase/migrations/20260917214744_shared_studio_without_accounts.sql` once. This new migration works independently; the older account-based migration is not required for a fresh setup. It creates a shared board with ginduyah (2 comics + 1 internet post daily), NBA comics (1 comic daily), and a renameable `Quatic` roster entry. It does not alter or expose any older private studio data.
2. On the **existing ginduyah Vercel project**, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the environments that should use this board. The legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted. Use a publishable/anon key, never a service-role or secret key. Keep Supabase's Data API enabled with `public` exposed; leave the internal `shared_studio` schema unexposed.
3. Apply `supabase/migrations/20260918185010_studio_pin_access.sql` once, after the shared-board migration. This stages the PIN functions and private session tables. Staging alone does **not** restrict the previous no-PIN API.
4. Deploy this frontend to the existing Vercel project. Both Supabase variables must also be configured for Preview when testing a Preview build. No new environment variables are needed for the PIN.
5. Configure the PIN from the Supabase SQL editor as the project owner: `select shared_studio.set_pin('YOUR_CHOSEN_NUMERIC_PIN', false);`. Replace the placeholder with 3–12 digits; keep the actual PIN out of Git and browser environment variables. This stages the PIN while the old frontend remains available. **The first correct PIN entry on the updated site atomically closes every old no-PIN RPC.** Before that first unlock, the board still has its previous open access. For immediate activation instead, omit `false`. An old frontend cannot load the board after activation.
6. Open `/studio`, enter the shared PIN, choose your name under **Working as**, and use **Manage team** to add or rename entries. No account creation or Supabase Auth setup is needed. Existing board data stays in place.

If Preview and Production use the same Supabase project, they share the same board, including all edits. Use a separate Supabase project for disposable testing if needed.

## Access and team members

The shared PIN is checked in the database. After activation, board reads and writes require an unexpired opaque session token. The PIN is bcrypt-hashed, and only SHA-256 hashes of random 256-bit session tokens are stored. Sessions last 8 hours, and **Lock studio** clears the local session immediately and asks the database to revoke it. Five incorrect PIN attempts trigger a shared 15-minute cooldown, including for attempts made outside the website. The owner can rotate the PIN or reset the cooldown by calling `shared_studio.set_pin` again; this also signs out every open session.

Anyone with the shared PIN can read and edit submissions, targets, channels, and roster entries. The chosen name labels contributions; it is not a verified personal identity or separate owner account.

Names have stable IDs, so renaming someone keeps their submissions and stage credits attached to them. Removal hides the name from the picker and clears their unfinished assignments; previous completed work and history remain. Removed names can be restored. At least one active member must remain. Removal is not an access ban: a visitor who knows the shared PIN can still choose another active name.

The selected name is saved in localStorage; an opaque access token is saved in sessionStorage for the current tab. The plaintext PIN is never persisted in the browser. When browser storage is unavailable, access lasts in memory until reload. All board data is saved in Supabase, not localStorage or a Vercel server's temporary filesystem. Reloading or opening the site on another device reads the saved board. Existing tabs refresh every 5 seconds while visible, and on focus, visibility change, or reconnection. The UI shows saving, saved, and connection failure states. It does not promise to save offline changes.

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

The public homepage, `/stats`, and all channel API aliases use `lib/channels.ts`: **@ginduyah** and **@gleebyreads** only. The stats page does not read the private studio board. Public YouTube totals use the existing server-only `YOUTUBE_API_KEY` and may be cached for an hour. Missing data displays as unavailable, never fabricated totals. Studio channel settings affect the board; the two public featured channels are maintained in the shared configuration.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run lint
pnpm run build
```

Tests run the actual migrations in PostgreSQL via PGlite. PIN tests cover correct and incorrect PINs, persisted cooldowns, expired/revoked tokens, old API denial, PIN rotation, and shared saves. Existing tests also check the original no-account setup, direct-table denial, persistent data after reopening the database, independent viewer reads, roster changes and retained credits, stale edits, stage rules, channel separation, target counts, and date boundaries. The older authenticated schema is also tested alongside the new migration so existing private data remains isolated.

After deployment and PIN activation, confirm a fresh browser shows only the PIN screen. Try an incorrect PIN, then unlock two separate browser sessions. Select different names; add and edit submissions, complete a stage, rename/remove/restore a member, and change a daily target. Confirm the other view updates within 5 seconds and a fresh reload still shows saved data. Try editing the same submission from both sessions; the stale form must reject its save. Check the interface at desktop and phone widths, plus generator/stats navigation.

Lock one browser and confirm it returns to the PIN screen; refresh must still require the PIN. The other unlocked browser should keep working. Local database tests and a successful build do not replace this hosted check.
