// The only way the service touches the database.
//
// THE RULE THIS MODULE EXISTS TO MAKE STRUCTURAL
//
//     There is no privileged connection in the serving path.
//
// Not "we are careful not to use one" — there is no way to reach one from a
// request. Every query a request makes goes through `asPerson()`, which binds
// the connection to that person's effective role before the first statement and
// unbinds it afterwards, whatever happens in between.
//
// Why this matters more than it sounds. The database enforces the entire
// permission model: five roles' worth of row-level policies, the countersign
// rule, the append-only guarantees. All of that is bypassed completely by the
// owner connection — row-level security is ENABLED, not FORCED, so the owner
// sees and writes everything. A single "it's just a count" query run as the
// owner therefore does not merely leak that count; it proves nothing about
// whether the caller was allowed to have it, and it will be copied.
//
// So the module exports no general query function at all. `migrate()` is the
// one privileged entry point, it runs at start-up, and it is not reachable from
// a request handler because handlers never receive the raw connection.
//
// WHAT IT ASSUMES, stated because ARCHITECTURE.md §5 already warns about it:
// one connection carries one authenticated identity for as long as it is in
// use. PGlite is a single connection, so this module serialises requests
// through it — which is the strictest possible reading of that assumption and
// also the shape most likely to leak if the reset is ever skipped. The
// interleaving test in service.test.mjs exists for exactly that reason.

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.CW_MIGRATIONS || join(HERE, '..', 'db', 'migrations');

const ROLE_TO_DB_ROLE = {
  viewer:         'cw_viewer',
  requester:      'cw_requester',
  legal_reviewer: 'cw_legal_reviewer',
  legal_admin:    'cw_legal_admin',
  auditor:        'cw_auditor',
  administrator:  'cw_administrator',
};

export class Db {
  #pg;
  // Requests are serialised onto the single connection by chaining promises.
  // Without this, two overlapping requests would interleave their `set role`
  // and their statements, and the second one's writes would be attributed to
  // the first one's person — the ADR-0008 residual as a live wire.
  #queue = Promise.resolve();

  constructor(pg) { this.#pg = pg; }

  static async open({ dataDir = undefined, migrate = true } = {}) {
    const pg = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
    const db = new Db(pg);
    if (migrate) await db.migrate();
    return db;
  }

  // The one privileged entry point, and it runs before the server listens.
  // Anything that needs elevation is a migration, not an endpoint.
  async migrate() {
    for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort())
      await this.#pg.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }

  // Run work as a named person holding a named role. This is the ONLY way a
  // request reaches the database.
  //
  // WHAT IS LOAD-BEARING HERE, said precisely, because the obvious reading is
  // wrong and the mutation harness caught it.
  //
  // The mechanism is the two BINDINGS at the top — the actor and the role, set
  // before the first statement — together with the queue that stops two
  // requests interleaving them. Break any of those three and audited writes
  // land under the wrong person or run with the wrong authority, and the
  // service tests fail on the audit rows.
  //
  // The `finally` block is a SECOND LINE, not the mechanism. Removing it changes
  // no observable behaviour, because every entry point binds both values before
  // reading anything, so a stale value is always overwritten rather than used.
  // It is kept because it is cheap and because the day somebody adds an entry
  // point that forgets to bind, this is what stops that becoming a leak — but a
  // comment claiming it is what prevents cross-attribution would be a document
  // promising more than the code does.
  //
  // Note it clears `cw.actor` as well as the role. That part is not decorative:
  // `cw.actor` is a session setting that outlives a `set role`, so a cleanup
  // that reset only the role would leave a name behind on the connection.
  async asPerson(person, role, fn) {
    const dbRole = ROLE_TO_DB_ROLE[role];
    if (!dbRole) throw new Error(`unknown application role: ${role}`);

    const run = async () => {
      // The person's name is set through a parameterised statement rather than
      // interpolated. It arrives from cw.account, not from the browser, but a
      // name with a quote in it would otherwise break the session for everyone
      // after it — and "it can't contain a quote" is the assumption that ages
      // worst.
      await this.#pg.query(`select set_config('cw.actor', $1, false)`, [person]);
      await this.#pg.exec(`set role ${dbRole};`);
      try {
        return await fn({
          query: async (sql, params = []) => (await this.#pg.query(sql, params)).rows,
        });
      } finally {
        await this.#pg.exec('reset role;');
        await this.#pg.query(`select set_config('cw.actor', '', false)`);
      }
    };

    const result = this.#queue.then(run, run);
    // Keep the queue alive whether or not this request succeeded, but do not
    // let a rejection here become an unhandled rejection on the chain itself.
    this.#queue = result.then(() => {}, () => {});
    return result;
  }

  // Sign-in has to read cw.account before any role is known, which is the one
  // genuine chicken-and-egg in the serving path. It is NOT done as the owner.
  //
  // cw_viewer is used instead: the least-privileged role in the system, which
  // holds select on cw.account and cw.effective_role (access is not a secret —
  // both carry role names and no contract content) and can do nothing else at
  // all. So the worst a bug in this path can do is read the staff list, and a
  // future identity provider replaces the lookup without touching the
  // privilege story.
  async lookUpIdentity(fn) {
    return this.asPerson('__signin__', 'viewer', fn);
  }

  async close() { await this.#pg.close(); }
}
