# Screenshot uploads and automatic dates

## Nana: upload a batch

1. Open Team Studio, enter the existing PIN and select your name.
2. Select @ginduyah (or another channel with internet-post daily targets).
3. Click **Upload screenshot batch** and choose up to 20 PNG/JPG/WebP files.
4. Each file becomes one internet-post submission. Change the titles, reorder
   files with the arrows and choose the earliest date to fill.
5. Click **Upload and assign dates**. Keep the window open until the batch finishes.

The server fills open internet-post slots in file order, skipping dates whose
internet-post targets are filled or set to zero. For @ginduyah, the first free
internet-post slot uses 4 PM Toronto time. After 4 PM, automatic dating starts no
earlier than tomorrow. Extra same-day targets can have an unknown upload time;
existing times and submissions are never overwritten. Dates are checked again
while each file saves, so concurrent users cannot overfill a daily target through
this batch tool. The search covers up to a year from the chosen start date.

Screenshots start with no completed production stages. They do not count as
Ready or Scheduled simply because a file was uploaded. Dates and titles can be
changed afterward in the normal submission editor.

## Several screenshots for one post

Create/open a submission and use **Add screenshots** inside its details. These
files attach to that one submission; they do not create separate dated posts.
Each submission accepts up to 20 files, with a 10 MB limit per file. HEIC must be
exported to JPG or PNG. Images are stored as their original bytes, without
compression or resizing.

## Editing and downloads

Open the submission to see previews and uploader names. Use **Download original**
to save a full-resolution file. Downloads and file lists work for anyone with a
valid team-PIN session. The screenshot list refreshes every 45 seconds while open,
and immediately when reopened or manually refreshed.

Use **Remove → Confirm removal** to delete a file. Remove attached files before
deleting their submission. Existing Discord/source links continue to work.

## Interrupted uploads

Finished files remain saved. The queue stops at the failed file; **Retry remaining
uploads** reuses its upload ID, preventing duplicate submissions. A draft may
already reserve its date. If the server is still processing that upload, refresh
the submission to check whether it finished. A failed pending upload can be
retried or removed after its ten-minute upload lease expires; this prevents a
late upload from racing removal. If the page was closed, open the draft, remove
the incomplete file after the wait, then add the screenshot again.

## Deployment and security

The migration and `studio-files` Supabase Edge Function are already deployed to
the connected ginduyah-studio project. No new Vercel variables, accounts or SQL
steps are required. Deploy the frontend update from the supplied ZIP.

The private `studio-screenshots` bucket is created on first upload. PNG/JPG/WebP
and 10 MB restrictions are enforced by the backend and bucket. Original uploads
are immutable, checked by file signature and SHA-256, and cannot overwrite an
existing screenshot.

The Edge Function implements custom PIN-session authentication on every request,
so its platform JWT check is intentionally disabled. Its database API is granted
only to `service_role`, and additionally verifies the actual PIN session and an
active team identity for mutations. Browser code never receives a secret key.
The function uses built-in `SUPABASE_SECRET_KEYS.default` or the built-in legacy
`SUPABASE_SERVICE_ROLE_KEY`. There are no public object policies. Preview links
expire in five minutes and download links in one minute; existing issued links
remain usable until their expiry. File removal also removes the stored object.

Supabase reports informational RLS-without-policy notices for these deliberately
private tables; clients access them only through checked functions:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Verification

`pnpm lint`, `pnpm test` and `pnpm build` passed. Tests cover upload permissions,
PIN expiry, exact original bytes, automatic dates, zero-target days, retries,
multiple screenshots per post, pending leases and removal. A live storage test
verified upload, auto-date, preview, original download from a second PIN session,
retry idempotency and denied public/direct access. Temporary test files and posts
were removed. The production build retains pre-existing non-fatal Open Graph
font/image warnings. Browser visual verification was not completed here.
