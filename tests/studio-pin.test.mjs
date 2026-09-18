import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { pgcrypto } });
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const rejects = async (fn, match) => { await assert.rejects(fn, match); checks++; };
const value = async (query, args = []) => (await db.query(query, args)).rows[0].result;
const unlock = pin => value('select public.studio_pin_unlock($1) as result', [pin]);
const snapshot = token => value('select public.studio_pin_snapshot($1) as result', [token]);
const mutate = (token, actor, operation, payload) => value('select public.studio_pin_mutate($1, $2, $3, $4) as result', [token, actor, operation, JSON.stringify(payload)]);
const owner = () => db.exec('reset role');
const anon = () => db.exec('set role anon');
const testPin = '7531';
try {
  await db.exec('create role anon; create role authenticated;');
  await db.exec(await readFile(new URL('../supabase/migrations/20260917214744_shared_studio_without_accounts.sql', import.meta.url), 'utf8'));
  const before = await value('select shared_studio.snapshot() as result');
  await db.exec(await readFile(new URL('../supabase/migrations/20260918185010_studio_pin_access.sql', import.meta.url), 'utf8'));
  await anon();
  check((await unlock(testPin)).ok, false, 'An unconfigured PIN never opens the gated API.');
  check(await value('select public.studio_shared_snapshot() as result'), before, 'Staging preserves the deployed frontend until activation.');
  await rejects(() => db.query('select shared_studio.set_pin($1)', [testPin]), /permission denied/);
  await rejects(() => snapshot(null), /team PIN/);
  await owner();
  await rejects(() => db.query('select shared_studio.set_pin($1)', ['']), /3 to 12/);
  await db.query('select shared_studio.set_pin($1, false)', [testPin]);
  await anon();
  check(await value('select public.studio_shared_snapshot() as result'), before, 'A staged PIN keeps the old frontend available during deployment.');
  check((await unlock('000')).ok, false, 'An incorrect PIN cannot activate the cutover.');
  check(await value('select public.studio_shared_snapshot() as result'), before, 'Failed entry does not interrupt the old frontend.');
  check((await unlock(testPin)).ok, true, 'The first correct PIN atomically activates protection.');
  await rejects(() => value('select public.studio_shared_snapshot() as result'), /permission denied/);
  await rejects(() => db.query('select shared_studio.activate_pin()'), /permission denied/);
  await owner();
  check(await value('select activated_at is not null as result from shared_studio.pin_settings'), true, 'The completed cutover is recorded.');
  await db.query('select shared_studio.set_pin($1)', [testPin]);
  check(await value('select shared_studio.snapshot() as result'), before, 'PIN activation preserves every board record.');
  const hash = await value('select pin_hash as result from shared_studio.pin_settings');
  check(hash !== testPin && hash.startsWith('$2'), true, 'The stored PIN is a salted bcrypt hash.');
  await anon();
  for (const query of [
    'select public.studio_shared_snapshot()',
    "select public.studio_shared_mutate(null, 'add_member', '{}')",
    'select shared_studio.snapshot()',
    "select shared_studio.mutate(null, 'add_member', '{}')",
    'select * from shared_studio.pin_settings',
    'select * from shared_studio.pin_sessions',
    'select * from shared_studio.items',
    "select shared_studio.require_pin_session('fake')",
  ]) await rejects(() => db.query(query), /permission denied/);
  await rejects(() => mutate('f'.repeat(64), before.members[0].user_id, 'add_member', { display_name: 'No access' }), /session ended/);
  for (const invalid of [null, '', 'wrong', 'f'.repeat(64), 'f'.repeat(10000)]) {
    await rejects(() => snapshot(invalid), /team PIN|session ended/);
  }
  check((await unlock('000')).ok, false, 'An incorrect PIN is rejected.');
  await owner();
  check(await value('select failed_attempts as result from shared_studio.pin_settings'), 1, 'Failed attempts commit instead of rolling back.');
  await anon();
  const first = await unlock(testPin);
  check(first.ok, true, 'The configured PIN opens a session.');
  check(/^[a-f0-9]{64}$/.test(first.access_token), true, 'Sessions use 256 bits of cryptographic randomness.');
  check(await snapshot(first.access_token), before, 'Unlocked visitors see the existing shared board.');
  check(JSON.stringify(await snapshot(first.access_token)).includes(hash), false, 'Board responses do not disclose PIN settings.');
  await owner();
  check(await value('select failed_attempts as result from shared_studio.pin_settings'), 0, 'A successful PIN resets failures.');
  check(await value("select encode(token_hash, 'hex') as result from shared_studio.pin_sessions" ) !== first.access_token, true, 'Only a hash of the session token is persisted.');
  await anon();
  const second = await unlock(testPin);
  check(second.access_token !== first.access_token, true, 'Each browser receives a different session.');
  const actor = before.members[0].user_id;
  let board = await mutate(first.access_token, actor, 'add_member', { display_name: 'PIN tester' });
  check((await snapshot(second.access_token)).workspace.revision, board.workspace.revision, 'A second unlocked visitor sees changes immediately.');
  check((await snapshot(second.access_token)).members.some(m => m.display_name === 'PIN tester'), true, 'Roster editing is shared behind the PIN.');
  await rejects(() => mutate(first.access_token, actor, 'edit_member', { user_id: actor, version: 99, display_name: 'Stale' }), /Someone updated/);
  await value('select public.studio_pin_lock($1) as result', [first.access_token]);
  await rejects(() => snapshot(first.access_token), /session ended/);
  check((await snapshot(second.access_token)).workspace.id, before.workspace.id, 'Locking one browser preserves another unlocked browser.');
  await owner();
  await db.query('update shared_studio.pin_sessions set expires_at = now() - interval \'1 second\'');
  await anon();
  await rejects(() => snapshot(second.access_token), /session ended/);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await unlock('000');
    check(result.ok, false, `Incorrect attempt ${attempt} is rejected.`);
    check(result.retry_after, attempt === 5 ? 900 : 0, 'The fifth failure starts the shared cooldown.');
  }
  const blocked = await unlock(testPin);
  check(blocked.ok, false, 'Even a correct PIN waits out an active cooldown.');
  check(blocked.retry_after > 0 && blocked.retry_after <= 900, true, 'The UI receives the remaining cooldown.');
  await owner();
  await db.exec("update shared_studio.pin_settings set blocked_until = now() - interval '1 second'");
  await anon();
  check((await unlock('000')).retry_after, 0, 'An expired cooldown starts a fresh attempt window.');
  const third = await unlock(testPin);
  check(third.ok, true, 'Unlock succeeds after the cooldown expires.');
  await owner();
  await db.query('select shared_studio.set_pin($1)', ['8620']);
  await anon();
  await rejects(() => snapshot(third.access_token), /session ended/);
  check((await unlock(testPin)).ok, false, 'PIN rotation rejects the previous PIN.');
  const rotated = await unlock('8620');
  check(rotated.ok, true, 'The new PIN opens the unchanged board.');
  check((await snapshot(rotated.access_token)).members.length, before.members.length + 1, 'Session rotation never deletes team data.');
  await owner();
  await db.query('select shared_studio.set_pin($1, false)', ['8620']);
  await anon();
  await rejects(() => value('select public.studio_shared_snapshot() as result'), /permission denied/);
  await rejects(() => snapshot(rotated.access_token), /session ended/);
  const finalSession = await unlock('8620');
  await owner();
  await db.exec('set role authenticated');
  await rejects(() => value('select public.studio_shared_snapshot() as result'), /permission denied/);
  await rejects(() => db.query('select shared_studio.set_pin($1)', ['1111']), /permission denied/);
  await rejects(() => snapshot(null), /team PIN/);
  check((await snapshot(finalSession.access_token)).workspace.id, before.workspace.id, 'A normal authenticated role also requires a PIN session.');
  console.log(`PASS: ${checks} PIN checks covering access, legacy bypasses, shared saves, cooldown, expiry, revocation, and rotation.`);
} finally { await db.close(); }
