// Run a governed act as a real database role.
//
// Why this exists
// ---------------
// Every suite in this directory already had an `asRole()` helper, and every one
// of them did the same thing: `reset role` plus two `set_config` calls. That
// sets the *claimed* application role in a session variable while the session
// itself stays connected as the database owner — and the owner bypasses
// row-level security entirely and holds every table privilege by definition.
//
// So the existing suites test policies only where they explicitly `set role`,
// and they only ever do that in the read-side sections at the bottom of each
// file. Every governed WRITE in the test suite runs as the owner. That is
// precisely why finding D1 survived: `promote_concession()` ends with an UPDATE
// against a table that has no UPDATE policy, which silently affects zero rows
// for a real `cw_legal_admin` — and passes cleanly for the owner.
//
// The rule this module enforces: if a protection is a policy or a grant, the
// test must perform the protected action as the role the policy names, on the
// write path. Anything else measures the owner's privileges, not the system's.

// Six now. The administrator arrived with 0013 (WP-U01) and is listed here for
// the same reason as the other five: a suite that cannot `become()` a role
// cannot test that role's policies, and an untestable role is an untested one.
const ROLE_TO_DB_ROLE = {
  viewer:         'cw_viewer',
  requester:      'cw_requester',
  legal_reviewer: 'cw_legal_reviewer',
  legal_admin:    'cw_legal_admin',
  auditor:        'cw_auditor',
  administrator:  'cw_administrator',
};

export function roleHelpers(db) {
  // Back to the owner. Migrations, seeding and grant surgery need this.
  const asOwner = () => db.exec('reset role;');

  // Become the real database role, and name the person acting.
  //
  // This used to also `set_config('cw.role', …)`, because cw.app_role() read
  // that session variable. WP-04 narrowed cw.app_role() to the connection's
  // actual database role, so `set role` alone now decides what the policies
  // see. Setting cw.role here would be dead machinery at best and actively
  // misleading at worst — a reader would think the claim still counts for
  // something. The one setting that is still live is cw.actor, the person's
  // name, which has no database-level source (see cw.app_actor() in 0001).
  const become = async (role, actor = `${role}@clausewerk`) => {
    const dbRole = ROLE_TO_DB_ROLE[role];
    if (!dbRole) throw new Error(`unknown application role: ${role}`);
    await db.exec(`reset role;
      select set_config('cw.actor', '${actor}', false);
      set role ${dbRole};`);
  };

  // Run one statement as a real role and always return the session to exactly
  // how it was found — even when the statement raises.
  //
  // Restoring `reset role` alone is not enough. `cw.actor` is a session setting
  // that outlives the role switch, so a helper that reset the role but left its
  // own actor behind would silently re-attribute every subsequent audited write
  // in the calling suite. That happened: it broke an unrelated audit assertion
  // in registry.test.mjs and pointed at the wrong test. The instrument must
  // leave no trace.
  const as = async (role, fn, actor) => {
    const before = (await db.query(
      `select current_setting('cw.actor', true) as actor`)).rows[0];
    await become(role, actor);
    try { return await fn(); }
    finally {
      await db.exec(`reset role;
        select set_config('cw.actor', '${before.actor ?? ''}', false);`);
    }
  };

  const execAs  = (role, sql, actor) => as(role, () => db.exec(sql), actor);
  const queryAs = (role, sql, params, actor) =>
    as(role, async () => (await db.query(sql, params)).rows, actor);

  // A write that must succeed for this role, with a clearer failure than a bare
  // privilege error.
  const mustWrite = async (role, sql, params, actor) => {
    try { return await queryAs(role, sql, params, actor); }
    catch (e) { throw new Error(`${role} should have been able to write, but: ${e.message}`); }
  };

  // A write that must be refused. Distinguishes a genuine refusal from the far
  // more dangerous silent no-op: an UPDATE with no matching policy does not
  // raise, it simply affects nothing. That is the exact shape of finding D1, so
  // a rowcount of zero counts as "refused" only when the caller says it should.
  const mustNotWrite = async (role, sql, params, { allowSilent = false } = {}) => {
    let threw = false, rows = null;
    try { rows = await queryAs(role, sql, params); }
    catch { threw = true; }
    if (threw) return 'raised';
    if (allowSilent) return 'silent';
    throw new Error(
      `${role} was not refused — the statement completed, affecting ` +
      `${rows ? rows.length : 0} row(s). A policy that silently no-ops is finding D1.`);
  };

  return { asOwner, become, as, execAs, queryAs, mustWrite, mustNotWrite, ROLE_TO_DB_ROLE };
}
