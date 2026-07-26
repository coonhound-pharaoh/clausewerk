// The service layer — sign-in and the borrowed permission model (WP-U05).
//
// The doorway exists. A person signs in by name, their session is bound to the
// one role the database says they hold, and the API holds no opinions: the
// database refuses what should be refused.
//
// FOUR THINGS THIS SUITE IS ACTUALLY FOR, and they are the four ways this layer
// could quietly undo the four migrations underneath it:
//
//   1. THE POOL BLEED. One connection, two people, interleaved. If the role or
//      the actor survives a request, the next person's writes are attributed to
//      the previous one — the ADR-0008 residual as a live wire, and invisible,
//      because both requests succeed. Asserted on the AUDIT ROWS the requests
//      produce, not on what the responses said.
//   2. THE FORGED CLAIM. A browser sending `X-Role: legal_admin` or an actor in
//      the body must change nothing at all.
//   3. THE PRIVILEGED SHORTCUT. Nothing in the serving path may run as the
//      owner, who bypasses row-level security entirely. Proved twice — once at
//      runtime, once against the source.
//   4. REVOCATION AT NEXT REQUEST. Not next sign-in. The role is resolved from
//      the database on every request precisely so that this is true, and the
//      test proves the promise the console is allowed to make — and no more.
//
//   node db/test/service.test.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const HERE = dirname(fileURLToPath(import.meta.url));

// The service is imported through a path the environment can redirect, exactly
// as the migrations are. Without this the mutation harness could not reach any
// of it, and every guarantee in this file — the pool bleed above all — would be
// a test that has never been seen to fail. A static import would be tidier and
// would leave the most important protection in the layer unproven.
const SERVICE = process.env.CW_SERVICE || join(HERE, '..', '..', 'service');
const load = (f) => import(pathToFileURL(join(SERVICE, f)).href);

const { Db }  = await load('db.mjs');
const { App } = await load('app.mjs');
const { parseDuration } = await load('sessions.mjs');

let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; failures.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

const OWNER = 'owner@clausewerk';
const ADMIN = 'a.okafor@clausewerk';
const LEGAL = 'r.vance@clausewerk';
const DANA  = 'd.buyer@clausewerk';
const ELI   = 'e.stone@clausewerk';
const PAT   = 'p.nkemi@clausewerk';

// A clock we control, so expiry is tested without waiting eight hours.
let clock = 1_000_000;
const now = () => clock;

// The installation story, followed exactly: migrate as the owner, then serve.
//
// The suite keeps the owner handle so it can seed and inspect; the SERVICE gets
// the same connection wrapped in Db, which offers no privileged path at all.
// That asymmetry is the point of the whole package. What is being proved is
// that a REQUEST cannot reach owner rights — not that a test cannot, since a
// test that could not seed would simply be a test with less in it.
const pg = await PGlite.create();
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'migrations');
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

// pg.query takes one statement; pg.exec takes many but no parameters. The
// helper picks whichever the caller actually needs.
const dbExec = (sql, params) =>
  params ? pg.query(sql, params) : pg.exec(sql).then(r => ({ rows: r.at(-1)?.rows ?? [] }));

const DB  = new Db(pg);
const APP = new App(DB, { now });
await dbExec(`select cw.bootstrap('${OWNER}','${ADMIN}','Ada Okafor',
                                  '${LEGAL}','Rae Vance','Head Office')`);

// The most basic claim this layer makes, asserted before anything is built on
// it. Deliberately first: if the binding is broken, every later act in this file
// — including the seeding two lines down — is attributed to nobody, and the
// suite would die in setup with a confusing error instead of saying what is
// actually wrong.
console.log('\nthe connection carries the caller into the database');

await test('a bound session sets both the name and the authority', async () => {
  const r = await DB.asPerson(ADMIN, 'administrator', ({ query }) =>
    query(`select cw.app_actor() as actor, cw.app_role() as role,
                  current_user as db_role`));
  eq(r[0].actor, ADMIN, 'the person\'s name never reached the connection');
  eq(r[0].role, 'administrator');
  eq(r[0].db_role, 'cw_administrator');
});

// Accounts and grants, performed as the administrator through the database
// (the console does this through the API in WP-U08).
await DB.asPerson(ADMIN, 'administrator', async ({ query }) => {
  for (const [p, n, r] of [[DANA,'Dana Buyer','requester'],
                           [ELI,'Eli Stone','requester'],
                           [PAT,'Pat Nkemi','legal_reviewer']]) {
    await query(`insert into cw.account (person,display_name,unit,role,created_by)
                 values ($1,$2,'Procurement',$3,$4)`, [p, n, r, ADMIN]);
    await query(`insert into cw.role_grant (action,person,role)
                 values ('granted',$1,$2)`, [p, r]);
  }
});

// Pat's grant is of a LEGAL role, so it confers nothing until a Legal admin
// accepts it. Writing this seed without the countersign was the first attempt,
// and every test needing Pat failed at sign-in with "no active account with an
// effective role" — the countersign rule reaching the doorway, working exactly
// as WP-U02 built it. Kept as a separate step rather than folded into the loop
// so that the difference between the two kinds of grant stays visible here.
await DB.asPerson(LEGAL, 'legal_admin', async ({ query }) => {
  const g = await query(`select grant_id from cw.role_grant
                         where person = $1 and action = 'granted'`, [PAT]);
  await query(`insert into cw.role_grant (action,person,role,grant_ref)
               values ('countersigned',$1,'legal_reviewer',$2)`, [PAT, g[0].grant_id]);
});

await dbExec(`
  insert into cw.category (key,label,short) values ('data','Data Privacy','DP');
  insert into cw.agreement (agreement_id,counterparty,requester) values
    ('AG-D1','Northwind','${DANA}'),
    ('AG-D2','Contoso','${DANA}'),
    ('AG-E1','Fabrikam','${ELI}');`);

const signIn = async (person) => {
  const r = await APP.signIn(person);
  assert(r.status === 200, `sign-in for ${person} failed: ${JSON.stringify(r.body)}`);
  return r.body.token;
};

// ── Sign-in ──────────────────────────────────────────────────────────────
console.log('\nsigning in as a named person');

await test('a person signs in and is told the role the database says they hold', async () => {
  const r = await APP.signIn(DANA);
  eq(r.status, 200);
  eq(r.body.person, DANA);
  eq(r.body.role, 'requester');
  assert(r.body.token, 'no session token issued');
});

await test('somebody with no account cannot sign in', async () => {
  const r = await APP.signIn('nobody@clausewerk');
  eq(r.status, 403);
  assert(/no active account/.test(r.body.reason));
});

await test('an anonymous sign-in is refused', async () => {
  eq((await APP.signIn('')).status, 400);
  eq((await APP.signIn(null)).status, 400);
});

await test('a request without a session gets nothing', async () => {
  const r = await APP.handle('GET', '/deals', { token: null });
  eq(r.status, 401);
});

await test('a made-up token gets nothing', async () => {
  const r = await APP.handle('GET', '/deals', { token: 'pretend-token' });
  eq(r.status, 401);
});

// ── The same endpoint, two roles, different rows ─────────────────────────
console.log('\ntwo sessions, two roles, one endpoint');

await test('two requesters see exactly their own deals and nobody else\'s', async () => {
  const dana = await signIn(DANA), eli = await signIn(ELI);
  const d = await APP.handle('GET', '/deals', { token: dana });
  const e = await APP.handle('GET', '/deals', { token: eli });
  eq(d.body.rows.map(r => r.agreement_id), ['AG-D1','AG-D2']);
  eq(e.body.rows.map(r => r.agreement_id), ['AG-E1'],
    'a requester saw another requester\'s deals');
});

await test('a legal reviewer sees all of them — the same endpoint, a wider policy', async () => {
  const pat = await signIn(PAT);
  const r = await APP.handle('GET', '/deals', { token: pat });
  eq(r.body.rows.map(x => x.agreement_id), ['AG-D1','AG-D2','AG-E1']);
});

await test('the difference comes from the database, not from a filter here', async () => {
  // The proof: the SQL the service runs for /deals has no WHERE clause at all.
  // If the scoping were in this layer it would have to.
  const src = readFileSync(join(SERVICE, 'app.mjs'), 'utf8');
  const deals = /'GET \/deals': \{\s*sql: `([^`]+)`/.exec(src);
  assert(deals, 'the /deals endpoint has changed shape; re-check this test');
  assert(!/where/i.test(deals[1]),
    'the /deals query has grown a WHERE clause — scoping moved into the API, '
    + 'which is the second permission system this layer exists to avoid');
});

await test('there is no role logic anywhere in the service', async () => {
  // A blunt instrument on purpose. Two permission systems drift, and the drift
  // is the vulnerability because both keep working and only one is tested as a
  // real role.
  for (const f of readdirSync(SERVICE).filter(f => f.endsWith('.mjs'))) {
    const src = readFileSync(join(SERVICE, f), 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const decisions = src.match(
      /(if|\?|&&|\|\|)[^\n]*\b(role)\s*===?\s*['"](viewer|requester|legal_reviewer|legal_admin|auditor|administrator)['"]/g);
    eq(decisions, null,
      `${f} decides something from the role name; the database decides, this layer binds`);
  }
});

// ── Forged claims ────────────────────────────────────────────────────────
console.log('\nnothing the browser sends changes who you are');

await test('a forged role header changes nothing', async () => {
  const dana = await signIn(DANA);
  const r = await APP.handle('GET', '/deals', {
    token: dana,
    headers: { 'x-cw-role': 'legal_admin', 'x-role': 'auditor' },
    body: { role: 'legal_admin' },
  });
  eq(r.body.rows.map(x => x.agreement_id), ['AG-D1','AG-D2'],
    'a header widened what a requester could see');
});

await test('a forged actor in the body changes nothing', async () => {
  const dana = await signIn(DANA);
  const r = await APP.handle('GET', '/me', {
    token: dana, body: { person: LEGAL, actor: LEGAL },
  });
  eq(r.body.rows[0].person, DANA, 'the body renamed the caller');
  eq(r.body.rows[0].role, 'requester');
});

await test('the service reads exactly one header, and it names a session', async () => {
  // Not "reads no headers" — server.mjs has to read the bearer token, and the
  // first version of this test failed the moment that file was added, which is
  // the check working rather than being wrong.
  //
  // The rule that actually matters is narrower and worth stating exactly:
  // `authorization` is the ONLY header that reaches identity, and it names a
  // SESSION — not a person and not a role. Everything else the browser sends is
  // data. So the assertion allows that one and forbids the rest.
  for (const f of readdirSync(SERVICE).filter(f => f.endsWith('.mjs'))) {
    const src = readFileSync(join(SERVICE, f), 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const headerReads = [...src.matchAll(/headers\s*(?:\.\s*(\w+)|\[\s*['"]([^'"]+)['"]\s*\])/g)]
      .map(m => (m[1] ?? m[2]).toLowerCase());
    const forbidden = headerReads.filter(h => h !== 'authorization');
    eq(forbidden, [],
      `${f} reads ${forbidden.join(', ')} from the request headers — the role and `
      + 'the actor come from the session, and nothing the browser sends changes either');
  }
});

await test('the service never reads a role or an actor out of a request body', async () => {
  for (const f of readdirSync(SERVICE).filter(f => f.endsWith('.mjs'))) {
    const src = readFileSync(join(SERVICE, f), 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const claims = src.match(/body\s*(?:\??\.\s*(?:role|actor)\b|\[\s*['"](?:role|actor)['"]\s*\])/g);
    eq(claims, null, `${f} takes a role or an actor from the request body`);
  }
});

// ── The pool bleed ───────────────────────────────────────────────────────
console.log('\nthe pool bleed: one connection, two people, interleaved');

await test('interleaved requests never cross-attribute — asserted on the audit rows', async () => {
  // The test the ADR-0008 residual demands. Two people write audited acts
  // through the same physical connection, overlapping, and every row must carry
  // the right name AND the right role.
  //
  // Asserted on what landed in the log, not on what the responses said: a bleed
  // shows up as two successful requests and a permanent record that names the
  // wrong person, which is precisely the failure nobody notices.
  const dana = await signIn(DANA), pat = await signIn(PAT);

  const act = (token, tag) => APP.handle('POST', '/test/audited-act',
    { token, body: { tag } });

  // Register a temporary mutation for the test to exercise. It records an
  // audited act, which is the thing attribution is carried on.
  APP.mutations = {
    'POST /test/audited-act': {
      run: (query, body) => query(
        `select cw.audit('service_test_act', $1, '{}'::jsonb)`, [body.tag]),
    },
  };

  await Promise.all([
    act(dana, 'dana-1'), act(pat, 'pat-1'),
    act(dana, 'dana-2'), act(pat, 'pat-2'),
    act(dana, 'dana-3'), act(pat, 'pat-3'),
  ]);

  const rows = (await dbExec(
    `select subject, actor, actor_role from cw.audit_event
     where event_type = 'service_test_act' order by seq`)).rows;
  eq(rows.length, 6, 'not every act was recorded');
  for (const r of rows) {
    const expectedPerson = r.subject.startsWith('dana') ? DANA : PAT;
    const expectedRole   = r.subject.startsWith('dana') ? 'requester' : 'legal_reviewer';
    eq(r.actor, expectedPerson,
      `act ${r.subject} was attributed to ${r.actor} — the actor bled between requests`);
    eq(r.actor_role, expectedRole,
      `act ${r.subject} recorded role ${r.actor_role} — the ROLE bled between requests`);
  }
});

await test('a failing request still returns the connection clean', async () => {
  // The finally block, tested. `cw.actor` is a session setting that outlives a
  // `set role`, so a reset that forgot it would silently re-attribute every
  // later audited write to whoever came before — and only on the error path,
  // which is the path nobody exercises.
  const dana = await signIn(DANA), pat = await signIn(PAT);
  APP.mutations = {
    'POST /test/audited-act': {
      run: (query, body) => query(
        `select cw.audit('service_test_act', $1, '{}'::jsonb)`, [body.tag]),
    },
    'POST /test/explode': { run: () => { throw new Error('deliberate'); } },
  };

  await APP.handle('POST', '/test/explode', { token: dana });
  await APP.handle('POST', '/test/audited-act', { token: pat, body: { tag: 'after-failure' } });

  const r = (await dbExec(
    `select actor, actor_role from cw.audit_event where subject='after-failure'`)).rows[0];
  eq([r.actor, r.actor_role], [PAT, 'legal_reviewer'],
    'a failed request left its identity behind on the connection');
});

await test('and a database refusal does too', async () => {
  const dana = await signIn(DANA), pat = await signIn(PAT);
  APP.mutations = {
    'POST /test/audited-act': {
      run: (query, body) => query(
        `select cw.audit('service_test_act', $1, '{}'::jsonb)`, [body.tag]),
    },
    'POST /test/refused': {
      run: (query) => query(
        `insert into cw.clause (clause_id,category_key,severity)
         values ('DP-H-777','data','High')`),
    },
  };
  const refused = await APP.handle('POST', '/test/refused', { token: dana });
  eq(refused.status, 403, 'a requester was allowed to write a clause');

  await APP.handle('POST', '/test/audited-act', { token: pat, body: { tag: 'after-refusal' } });
  const r = (await dbExec(
    `select actor, actor_role from cw.audit_event where subject='after-refusal'`)).rows[0];
  eq([r.actor, r.actor_role], [PAT, 'legal_reviewer']);
});

// ── No privileged connection in the serving path ─────────────────────────
console.log('\nnothing in the serving path runs as the owner');

await test('every request runs as a real application role, never the owner', async () => {
  APP.mutations = {
    'POST /test/whoami': {
      run: (query) => query(
        `select current_user as u, cw.app_role() as role, cw.app_actor() as actor`),
    },
  };
  for (const [person, role, dbRole] of [
    [DANA, 'requester', 'cw_requester'],
    [PAT, 'legal_reviewer', 'cw_legal_reviewer'],
    [ADMIN, 'administrator', 'cw_administrator'],
    [LEGAL, 'legal_admin', 'cw_legal_admin'],
  ]) {
    const t = await signIn(person);
    const r = await APP.handle('POST', '/test/whoami', { token: t });
    eq(r.body.rows[0].u, dbRole, `${person}'s request ran as ${r.body.rows[0].u}`);
    eq(r.body.rows[0].role, role);
    eq(r.body.rows[0].actor, person);
    assert(r.body.rows[0].role !== null,
      'a request ran with no application role, which is the owner');
  }
});

await test('the service exposes no way to query outside a bound session', async () => {
  // Structural, not by convention. db.mjs exports one class whose only query
  // paths set a role first; there is no general-purpose query export to reach
  // for when an endpoint is awkward.
  const src = readFileSync(join(SERVICE, 'db.mjs'), 'utf8');
  const exported = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm)]
    .map(m => m[1]);
  eq(exported, ['Db'], 'db.mjs exports something other than the Db class');
  assert(/reset role/.test(src), 'the role is never reset');
});

await test('sign-in itself is not privileged either', async () => {
  // The one genuine chicken-and-egg: cw.account must be read before any role is
  // known. It is read as cw_viewer — the least-privileged role there is — so a
  // bug on this path leaks the staff list and nothing else.
  const src = readFileSync(join(SERVICE, 'db.mjs'), 'utf8');
  const fn = /async lookUpIdentity[\s\S]*?\n  \}/.exec(src)[0];
  assert(/'viewer'/.test(fn),
    'the sign-in lookup does not run as the least-privileged role');
  assert(!/reset role;\s*$/.test(fn));
});

// ── Revocation, and exactly what is promised ─────────────────────────────
console.log('\nrevocation is honoured at the next request');

await test('a revoked person is refused on their very next request', async () => {
  const eli = await signIn(ELI);
  eq((await APP.handle('GET', '/deals', { token: eli })).status, 200,
    'the session should work before the revocation');

  await DB.asPerson(ADMIN, 'administrator', async ({ query }) => {
    const g = await query(`select grant_id from cw.role_grant
                           where person=$1 and action='granted'`, [ELI]);
    await query(`insert into cw.role_grant (action,person,role,grant_ref,reason)
                 values ('revoked',$1,'requester',$2,'left the company')`,
      [ELI, g[0].grant_id]);
  });

  const after = await APP.handle('GET', '/deals', { token: eli });
  eq(after.status, 403, 'a revoked person kept working on an existing session');
  assert(/revoked/.test(after.body.reason));
});

await test('an uncountersigned Legal grant gets no session at all', async () => {
  // The countersign rule reaching the doorway. Not a lesser session — none.
  const NEW = 'n.hart@clausewerk';
  await DB.asPerson(ADMIN, 'administrator', async ({ query }) => {
    await query(`insert into cw.account (person,display_name,role,created_by)
                 values ($1,'Nia Hart','legal_reviewer',$2)`, [NEW, ADMIN]);
    await query(`insert into cw.role_grant (action,person,role)
                 values ('granted',$1,'legal_reviewer')`, [NEW]);
  });

  const r = await APP.signIn(NEW);
  eq(r.status, 403, 'a pending Legal grant let somebody in');

  // And once a Legal admin countersigns, the same person signs in.
  await DB.asPerson(LEGAL, 'legal_admin', async ({ query }) => {
    const g = await query(`select grant_id from cw.role_grant
                           where person=$1 and action='granted'`, [NEW]);
    await query(`insert into cw.role_grant (action,person,role,grant_ref)
                 values ('countersigned',$1,'legal_reviewer',$2)`, [NEW, g[0].grant_id]);
  });
  const ok = await APP.signIn(NEW);
  eq(ok.status, 200);
  eq(ok.body.role, 'legal_reviewer');
});

await test('the role is resolved every request, not cached at sign-in', async () => {
  // This is WHY revocation bites at the next request. If the role were captured
  // in the session, it would bite at the next sign-in, which for an eight-hour
  // session means tomorrow — and the console would say revoked while the person
  // went on working.
  const src = readFileSync(join(SERVICE, 'sessions.mjs'), 'utf8');
  assert(!/\brole\b/.test(src.replace(/\/\/[^\n]*/g, '')),
    'sessions.mjs stores a role; it must store a person and nothing more');
});

// ── Expiry ───────────────────────────────────────────────────────────────
console.log('\nsessions expire, on the length an administrator sets');

await test('a session expires and re-sign-in is required', async () => {
  const dana = await signIn(DANA);
  eq((await APP.handle('GET', '/deals', { token: dana })).status, 200);
  clock += 8 * 3_600_000 + 1;
  eq((await APP.handle('GET', '/deals', { token: dana })).status, 401,
    'an expired session still worked');
  const again = await APP.signIn(DANA);
  eq(again.status, 200);
});

await test('the length comes from the operational setting, not a constant', async () => {
  await DB.asPerson(ADMIN, 'administrator', ({ query }) =>
    query(`update cw.governance_setting set value='1h' where key='session_length'`));
  const t = await signIn(DANA);
  clock += 3_600_000 + 1;
  eq((await APP.handle('GET', '/deals', { token: t })).status, 401,
    'the session outlived the length the administrator set');
});

await test('durations parse, and a nonsense value falls back rather than to zero', async () => {
  eq(parseDuration('45m', 99), 2_700_000);
  eq(parseDuration('8h', 99), 28_800_000);
  eq(parseDuration('30d', 99), 2_592_000_000);
  eq(parseDuration('', 99), 99);
  eq(parseDuration('soon', 99), 99,
    'an unparseable session length must not become an instantly-expiring session');
});

await test('signing out ends the session', async () => {
  await DB.asPerson(ADMIN, 'administrator', ({ query }) =>
    query(`update cw.governance_setting set value='8h' where key='session_length'`));
  const t = await signIn(DANA);
  await APP.handle('POST', '/sign-out', { token: t });
  eq((await APP.handle('GET', '/deals', { token: t })).status, 401);
});

// ── Refusals are reported, not invented ──────────────────────────────────
console.log('\na refusal says which rule refused');

await test('the database\'s own words reach the caller unchanged', async () => {
  const admin = await signIn(ADMIN);
  APP.mutations = {
    'POST /test/owner-decision': {
      run: (query) => query(
        `update cw.governance_setting set value='x'
         where key='renewal_default_baseline'`),
    },
  };
  const r = await APP.handle('POST', '/test/owner-decision', { token: admin });
  eq(r.status, 403);
  assert(/only a legal admin may change it/.test(r.body.reason),
    'the refusal was reworded, losing the rule it names: ' + r.body.reason);
});

await test('the health endpoint is refused for a requester and served for an administrator', async () => {
  const dana = await signIn(DANA), admin = await signIn(ADMIN);
  eq((await APP.handle('GET', '/health', { token: dana })).status, 403);
  const a = await APP.handle('GET', '/health', { token: admin });
  eq(a.status, 200);
  assert(a.body.rows.length > 0);
});

await test('an unknown endpoint is a 404, not a silent empty list', async () => {
  const dana = await signIn(DANA);
  const r = await APP.handle('GET', '/everything', { token: dana });
  eq(r.status, 404);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nfailures:');
  for (const [n, m] of failures) console.log(`  · ${n}\n    ${m}`);
  process.exit(1);
}
