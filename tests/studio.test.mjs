import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

// Run the actual production migration in an isolated PostgreSQL engine.
// Only Supabase's auth.uid() and auth.users are replaced with test fixtures.
const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
await db.exec(await readFile(new URL('../supabase/migrations/202609170001_team_studio.sql', import.meta.url), 'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20260917214744_shared_studio_without_accounts.sql', import.meta.url), 'utf8'));
const alice = '10000000-0000-4000-8000-000000000001';
const bob = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
await db.query('insert into auth.users(id) values ($1), ($2), ($3)', [alice, bob, outsider]);
async function as(id, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
  await db.exec(`set role ${role}`);
}
const scalar = async (query, params = []) => (await db.query(query, params)).rows[0].result;
const snapshot = team => scalar('select public.studio_snapshot($1) as result', [team]);
const mutate = (team, operation, payload) => scalar('select public.studio_mutate($1, $2, $3) as result', [team, operation, JSON.stringify(payload)]);
let assertions = 0;
async function rejects(operation, match) { await assert.rejects(operation, match); assertions++; }
function check(value, expected, message) { assert.deepEqual(value, expected, message); assertions++; }

try {
  await as(null, 'anon');
  await rejects(() => db.query('select public.studio_list_workspaces()'), /permission denied/);
  await rejects(() => db.query('select * from public.studio_items'), /permission denied/);
  await as(alice);
  const team = await scalar('select public.studio_create_workspace($1, $2) as result', ['QA crew', 'Alice']);
  let board = await snapshot(team);
  check(board.channels.length, 2, 'Every team starts with two channels.');
  const ginduyah = board.channels.find(c => c.name === 'ginduyah');
  const nba = board.channels.find(c => c.name === 'NBA comics');
  check([ginduyah.comic_goal, ginduyah.post_goal], [2, 1], 'Ginduyah gets the requested targets.');
  const invite = board.workspace.invite_code;
  await as(outsider);
  check(await scalar('select public.studio_list_workspaces() as result'), [], 'Other teams cannot be listed.');
  await rejects(() => snapshot(team), /access/);
  await rejects(() => mutate(team, 'add_item', { channel_id: ginduyah.id }), /access/);
  await rejects(() => scalar('select public.studio_join_workspace($1, $2) as result', ['bad-code', 'Outsider']), /invalid or has expired/);
  await as(bob);
  check(await scalar('select public.studio_join_workspace($1, $2) as result', [invite, 'Bob']), team, 'Invite joins the same shared team.');
  check((await snapshot(team)).workspace.invite_code, null, 'Invite code is owner-only.');
  await rejects(() => mutate(team, 'rotate_invite', {}), /Only the team owner/);
  await as(alice);
  await mutate(team, 'add_item', { channel_id: ginduyah.id, title: 'QA comic', content_type: 'comic', due_date: '2026-09-17', initial_status: 'planned', submitted_by: bob });
  board = await snapshot(team);
  const item = board.items[0];
  check(item.submitted_by, alice, 'The database derives the submitter, ignoring spoofed input.');
  check(board.steps.length, 4, 'All workflow stages exist.');
  await rejects(() => mutate(team, 'set_step', { item_id: item.id, stage: 'scheduled', version: 1, done: true }), /edit finished/);
  await mutate(team, 'set_step', { item_id: item.id, stage: 'voiceover', version: 1, assigned_to: bob });
  await as(bob);
  await mutate(team, 'set_step', { item_id: item.id, stage: 'voiceover', version: 2, done: true, completed_by: alice });
  board = await snapshot(team);
  check(board.steps.find(s => s.stage === 'voiceover').completed_by, bob, 'Completion credit uses the authenticated actor.');
  check(board.activity[0].actor_id, bob, 'The audit log uses the authenticated actor.');
  await rejects(() => mutate(team, 'set_step', { item_id: item.id, stage: 'voiceover', version: 1, done: false }), /Someone updated/);
  await rejects(() => mutate(team, 'set_step', { item_id: item.id, stage: 'edit', version: 1, assigned_to: outsider }), /active team member/);
  await rejects(() => mutate(team, 'delete_item', { item_id: item.id, version: 1 }), /submitter or team owner/);
  await as(alice);
  await mutate(team, 'set_step', { item_id: item.id, stage: 'edit', version: 1, done: true });
  await mutate(team, 'set_step', { item_id: item.id, stage: 'scheduled', version: 1, done: true });
  await rejects(() => mutate(team, 'set_step', { item_id: item.id, stage: 'edit', version: 2, done: false }), /Reopen scheduling/);
  await as(bob);
  await rejects(() => mutate(team, 'set_step', { item_id: item.id, stage: 'scheduled', version: 2, done: false }), /person who completed/);
  await as(alice);
  await mutate(team, 'edit_item', { item_id: item.id, version: 1, title: 'QA comic moved', content_type: 'comic', due_date: '2026-09-18' });
  await rejects(() => mutate(team, 'edit_item', { item_id: item.id, version: 1, title: 'Stale title', content_type: 'comic', due_date: '2026-09-17' }), /Someone updated/);
  await mutate(team, 'set_goal', { channel_id: ginduyah.id, day: '2026-09-18', comic_goal: 4, post_goal: 2 });
  board = await snapshot(team);
  check(board.goals.length, 1, 'Daily target changes only add one dated override.');
  check(board.channels.find(c => c.id === ginduyah.id).comic_goal, 2, 'Changing one day does not rewrite the default.');
  check(board.items.filter(i => i.channel_id === nba.id).length, 0, 'Channels keep independent submissions.');
  await rejects(() => mutate(team, 'add_item', { channel_id: ginduyah.id, title: 'Bad link', content_type: 'comic', due_date: '2026-09-18', link: 'javascript:alert(1)' }), /check constraint/);
  await mutate(team, 'rotate_invite', {});
  await as(outsider);
  await rejects(() => scalar('select public.studio_join_workspace($1,$2) as result', [invite, 'Outsider']), /invalid or has expired/);
  const otherTeam = await scalar('select public.studio_create_workspace($1, $2) as result', ['Other team', 'Outsider']);
  const otherChannel = (await snapshot(otherTeam)).channels[0].id;
  await as(alice);
  await rejects(() => mutate(team, 'set_goal', { channel_id: otherChannel, day: '2026-09-18', comic_goal: 9, post_goal: 9 }), /Channel not found/);
  await mutate(team, 'remove_member', { user_id: bob });
  await as(bob);
  await rejects(() => snapshot(team), /access/);
  await as(alice);
  check((await snapshot(team)).steps.find(s => s.stage === 'voiceover').completed_by, bob, 'Removing access preserves past credit.');
  await mutate(team, 'restore_member', { user_id: bob });
  await as(bob);
  check((await snapshot(team)).members.find(m => m.user_id === bob).active, true, 'Restored membership works.');
  await as(alice);
  await mutate(team, 'delete_item', { item_id: item.id, version: 2 });
  board = await snapshot(team);
  check(board.items.length, 0, 'Removed item no longer contributes to counts.');
  check(board.steps.length, 0, 'Removed item has no orphaned stages.');
  check(board.activity.some(a => a.action === 'removed' && a.title === 'QA comic moved'), true, 'Removal retains audit history.');

  const source = await readFile(new URL('../lib/studio/types.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  check(model.torontoDate(new Date('2026-09-18T02:00:00Z')), '2026-09-17', 'Toronto date survives UTC midnight.');
  check(model.weekDays('2026-09-20'), ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20'], 'Sunday belongs to the preceding Monday week.');
  check(model.shiftDate('2026-03-08', 1), '2026-03-09', 'Date navigation survives DST.');
  const sampleItem = { ...item, due_date: '2026-09-17' };
  const sample = { ...board, goals: [], items: [sampleItem], steps: [{ item_id: item.id, stage: 'edit', completed_at: '2026-09-17T12:00:00Z' }, { item_id: item.id, stage: 'scheduled', completed_at: '2026-09-17T13:00:00Z' }] };
  check(model.countsFor(sample, ginduyah, '2026-09-17', 'comic'), { target: 2, submitted: 1, finished: 1, remaining: 1, unplanned: 1 }, 'Scheduled and edited count as one finished upload.');
  check(model.countsFor(sample, ginduyah, '2026-09-17', 'internet_post').remaining, 1, 'Extra comics cannot cover internet-post targets.');
  check(model.safeLink('javascript:alert(1)'), null, 'Unsafe link schemes are rejected.');
  console.log(`PASS: ${assertions} checks for shared data, permissions, credits, conflicts, channels, counts, and dates.`);
} finally { await db.close(); }
