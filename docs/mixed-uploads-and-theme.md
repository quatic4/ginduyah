# Comics, internet posts and site themes

Upload screenshot batches from Team Studio. Set each file's Type to Comic or
Internet post before uploading. Every file creates one submission and fills the
next available target for its type. The existing channel goals and per-day
overrides are respected. Ginduyah comic slots are 11 AM and 9 PM; its internet-post
slot is 4 PM, in Toronto time. Passed slots are skipped. Additional custom targets
can have an unset time. Other channels receive dates with no assumed upload time.

For several screenshots belonging to one video, choose **One video · multiple
screenshots** in Upload as, select all the files, and set one Video title and Video
type. The first screenshot creates the submission; the others attach to that same
submission, using only one date slot. Interrupted batches resume in the same
submission. This works for both comics and internet posts. You can also add more
files later inside the submission under Screenshots. Uploaded originals remain private behind the existing PIN
session. Uploading does not mark the editing or scheduling stages complete.

The header's Theme control is now available on the Reddit generator, Team Studio,
the PIN screen and Site stats. Choose a preset or animated RGB. The choice persists
on that browser/device and synchronizes between its tabs. Reduced-motion settings
pause the RGB animation. Card export appearance stays controlled by the generator's
separate card theme setting.

## Deployment order

1. Apply `20261012005517_mixed_screenshot_types.sql` to the existing Supabase project.
2. Deploy the updated `studio-files` Edge Function. Keep JWT verification disabled;
   this existing function authenticates every operation through the team PIN session.
3. Deploy the frontend from main. No new environment variables are required.

The new database functions also accept uploads from the previous frontend. Missing
batch types still default to internet posts. Repeating the migration is safe.

## Verification completed

- Full existing automated test suite, including the shared board, PIN, calendar,
  Reddit import, upload storage handler and PostgreSQL integration tests.
- Mixed comic/post preview and database parity across target overrides, occupied
  slots, zero targets, same-day cutoffs and daylight-saving transitions.
- Three-screenshot groups create one submission with one date and type, including
  when the second screenshot is interrupted and retried.
- Original-byte storage, stable upload IDs, retry type/destination checks, private
  access, multi-panel attachments and safe removal.
- React component interaction checks in a simulated DOM: per-file selection,
  multipart payloads, interrupted batch retry, completed rows, theme navigation,
  reload persistence, RGB animation, reduced motion, Escape and cross-tab changes.
- TypeScript check and optimized Next.js production build.

Production browser verification remains pending deployment. The connected GitHub
app rejected writes, and Supabase's migration tool returned an expired request
error. No live update was applied from this session.
