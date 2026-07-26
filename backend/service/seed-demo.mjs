// Seed a running service with enough real people to walk the six workspaces.
//
// WHAT THIS IS NOT: canned content. Every row it creates is created through the
// real path — the bootstrap ceremony, then the administrator's own endpoints —
// so nothing here can produce a state the system could not reach on its own.
// That is the difference between a seed and a mockup, and it is the whole
// reason the v4 concept's invented rows are not imported anywhere.
//
// It creates six accounts, one per role, so that somebody can sign in as each
// and see their workspace. It creates no deals, no tickets and no clauses:
// those are acts for the people in the system to perform, and an empty
// workspace showing its honest empty state is the correct first impression.
//
//   node service/seed-demo.mjs --data ./cw-data
//   node service/seed-demo.mjs                  (in-memory; prints and exits)

import { Db } from './db.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

const OWNER = 'owner@clausewerk';
const PEOPLE = [
  ['a.okafor@clausewerk', 'Ada Okafor',   'Operations',  'administrator'],
  ['r.vance@clausewerk',  'Rae Vance',    'Legal',       'legal_admin'],
  ['p.nkemi@clausewerk',  'Pat Nkemi',    'Legal',       'legal_reviewer'],
  ['d.buyer@clausewerk',  'Dana Buyer',   'Procurement', 'requester'],
  ['t.imani@clausewerk',  'Tunde Imani',  'Assurance',   'auditor'],
  ['s.reed@clausewerk',   'Sam Reed',     'Supplier',    'viewer'],
];
const [ADMIN, LEGAL] = [PEOPLE[0][0], PEOPLE[1][0]];

const db = await Db.open({ dataDir: args.data });

// The ceremony creates the first two. It refuses if it has run before, so this
// script is safe to re-run against an existing data directory — it will say so
// and stop rather than pretend.
try {
  await db.asPerson(OWNER, 'viewer', () => {});   // no-op; keeps the shape honest
} catch { /* ignore */ }

const already = await db.lookUpIdentity(({ query }) =>
  query(`select count(*)::int n from cw.account`));

if (already[0].n > 0) {
  console.log(`this database already has ${already[0].n} account(s); nothing to do.`);
  console.log('the bootstrap ceremony happens once, and accounts are revoked rather than deleted.');
  await db.close();
  process.exit(0);
}

// The ceremony needs owner rights, which the service deliberately cannot reach.
// This script is installation, not a request, so it goes through Db's migrate
// path — the same asymmetry the service tests rely on.
await db.bootstrap(OWNER, PEOPLE[0], PEOPLE[1]);

// The remaining four, created and granted by the Administrator, through exactly
// the acts the console will perform in WP-U08.
await db.asPerson(ADMIN, 'administrator', async ({ query }) => {
  for (const [person, name, unit, role] of PEOPLE.slice(2)) {
    await query(`insert into cw.account (person,display_name,unit,role,created_by)
                 values ($1,$2,$3,$4,current_setting('cw.actor'))`, [person, name, unit, role]);
    await query(`insert into cw.role_grant (action,person,role,reason)
                 values ('granted',$1,$2,'seeded for the walkthrough')`, [person, role]);
  }
});

// Pat holds a LEGAL role, so their grant confers nothing until Rae accepts it.
// Doing this here rather than silently is the point: a walkthrough that skipped
// the countersign would leave the reviewer unable to sign in, and somebody would
// "fix" it by removing the rule.
await db.asPerson(LEGAL, 'legal_admin', async ({ query }) => {
  const g = await query(`select grant_id from cw.role_grant
                         where person = 'p.nkemi@clausewerk' and action = 'granted'`);
  await query(`insert into cw.role_grant (action,person,role,grant_ref)
               values ('countersigned','p.nkemi@clausewerk','legal_reviewer',$1)`,
    [g[0].grant_id]);
});

const effective = await db.lookUpIdentity(({ query }) =>
  query(`select person, display_name, role from cw.effective_role order by role`));

console.log('six people, one per role. Sign in as any of them:\n');
for (const p of effective)
  console.log(`  ${p.role.padEnd(15)} ${p.person.padEnd(24)} ${p.display_name}`);

console.log(`
No deals, tickets or clauses were created. Those are acts for the people above
to perform, and an empty workspace showing its honest empty state is the correct
first impression — a seeded system that looks busy is a demo, not a system.`);

await db.close();
