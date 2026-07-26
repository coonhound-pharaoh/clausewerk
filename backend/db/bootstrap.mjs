// The bootstrap ceremony — run once, by the owner, on a new installation.
//
// WHAT THIS IS FOR
// Only an Administrator may create an account, and on a new installation there
// is no Administrator. Somebody has to make the first one. That somebody is the
// database owner, acting once, in the open, with the act recorded on the audit
// chain as a bootstrap act.
//
// It creates exactly two accounts:
//
//   · the first Administrator — who will create everybody else, and
//   · the first Legal admin  — who will countersign the Administrator's grants
//                              of the two Legal roles (decision U6).
//
// Two people, not one. If the same person held both, the countersign rule would
// be satisfied by one signature from the first minute of the system's life, and
// the whole control would be decoration. The database refuses it.
//
// WHY IT IS SAFE TO HAVE THIS SCRIPT LYING AROUND
// It is not the security boundary. The refusals live in cw.bootstrap() in
// migration 0013 and hold however this script is invoked, edited, or bypassed:
// the function refuses if any account exists, refuses any caller holding an
// application role, and is executable by none of the six roles. Deleting this
// file would not make the system safer, and running it twice cannot make it
// less safe. It exists so the ceremony is repeatable and documented rather than
// improvised at a psql prompt.
//
// USAGE
//   node db/bootstrap.mjs --by <you> \
//     --administrator <person> --administrator-name "<name>" \
//     --legal-admin   <person> --legal-admin-name   "<name>" \
//     [--unit "<unit>"] [--data <dir>]
//
// --data points at a PGlite data directory. Omit it and the ceremony runs
// against a throwaway in-memory database, which is useful for seeing what it
// does and useless for anything else — it says so when it happens.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, 'migrations');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const REQUIRED = ['by', 'administrator', 'administrator-name',
                  'legal-admin', 'legal-admin-name'];
const missing = REQUIRED.filter(k => !args[k]);
if (missing.length || args.help) {
  console.error(
`the bootstrap ceremony — run once, by the owner

  node db/bootstrap.mjs --by <you> \\
    --administrator <person> --administrator-name "<name>" \\
    --legal-admin   <person> --legal-admin-name   "<name>" \\
    [--unit "<unit>"] [--data <dir>]

Creates the first Administrator and the first Legal admin, and records both acts
on the audit chain marked as bootstrap acts. Refuses if any account already
exists — the ceremony happens once.

--by is the human performing the ceremony. It goes on the permanent record as
the actor, so put a real name there.`);
  if (missing.length) console.error(`\nmissing: ${missing.map(m => '--' + m).join(', ')}`);
  process.exit(1);
}

if (args.administrator === args['legal-admin']) {
  console.error(
`refused: --administrator and --legal-admin must be two different people.

The Administrator proposes a Legal-role grant and a Legal admin countersigns it
(decision U6). One person holding both roles satisfies that rule alone, which
means it is not a rule.`);
  process.exit(1);
}

const db = args.data
  ? await PGlite.create(args.data)
  : await PGlite.create();

if (!args.data) {
  console.log(
`note: no --data directory given, so this ran against a throwaway in-memory
database. Nothing was persisted. Pass --data <dir> to bootstrap a real one.\n`);
}

// Migrations are idempotent enough to re-run on an existing directory only if
// the deployment has already applied them; on a fresh directory they are what
// creates the schema. Applying them here keeps the ceremony to one command.
for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
  await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));

try {
  await db.query(
    `select cw.bootstrap($1, $2, $3, $4, $5, $6)`,
    [args.by, args.administrator, args['administrator-name'],
     args['legal-admin'], args['legal-admin-name'], args.unit ?? null]);
} catch (e) {
  // The function's own refusals are the authority and they are already written
  // in plain language, so they are passed through rather than reworded.
  console.error(`refused by the database:\n\n  ${e.message}\n`);
  await db.close();
  process.exit(1);
}

const accounts = (await db.query(
  `select person, display_name, unit, role from cw.account order by role`)).rows;
const events = (await db.query(
  `select seq, event_type, actor, actor_kind, subject
   from cw.audit_event order by seq`)).rows;

console.log('the ceremony is complete. Two accounts exist:\n');
for (const a of accounts)
  console.log(`  ${a.role.padEnd(14)} ${a.person}  (${a.display_name}${a.unit ? ', ' + a.unit : ''})`);

console.log('\nand these acts are on the audit chain:\n');
for (const e of events)
  console.log(`  #${String(e.seq).padEnd(3)} ${e.event_type.padEnd(22)} ${e.actor}  [${e.actor_kind}]`);

console.log(
`
The ceremony cannot be performed again — cw.bootstrap() refuses while any
account exists, and accounts are revoked rather than deleted.

From here on, ${args.administrator} creates the accounts. Grants of the two
Legal roles take effect only when ${args['legal-admin']} countersigns them.`);

await db.close();
