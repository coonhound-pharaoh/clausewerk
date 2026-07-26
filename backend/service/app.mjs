// The service. Identity in, rows out, and no opinions in between.
//
// WHAT THIS LAYER IS FOR, and it is a shorter list than it looks:
//
//   1. Work out WHO is calling, from the session.
//   2. Ask the database what that person may do RIGHT NOW.
//   3. Run their query on a connection bound to that role and that name.
//   4. Report what the database said, including its refusals, unchanged.
//
// WHAT IT DELIBERATELY DOES NOT DO: decide anything. There is not one
// `if (role === 'legal_admin')` in this file, and there must never be. The
// database already holds the whole permission model — six roles' worth of
// row-level policies, the countersign rule, the append-only guarantees — and a
// second copy of those rules here would drift from the first. The drift is the
// vulnerability, because it is invisible: both systems keep working, they just
// stop agreeing, and the one that is wrong is the one nobody tested as a real
// role.
//
// So an endpoint is a SQL statement and a route. Adding one adds no permission
// logic, because there is no permission logic to add to. If a workspace needs a
// narrower slice of something, that is a read model on the backend, not a
// filter here and certainly not a filter in the browser.
//
// THREE THINGS THE BROWSER CANNOT INFLUENCE, ever:
//   · the role     — it comes from cw.effective_role, keyed on the session
//   · the actor    — it comes from the session, never from a header or a body
//   · the rows     — they come from a policy, never from a WHERE clause we add
//                    on the client's behalf

import { Sessions, parseDuration, EIGHT_HOURS } from './sessions.mjs';
import { MUTATIONS } from './mutations.mjs';

// ── The read endpoints ─────────────────────────────────────────────────────
// Each is a pass-through of an existing read model. The comment on each says
// which database rule decides what comes back, because that rule — not this
// file — is the answer to "why can this person see this?".
const READS = {
  // Whoever I am, and what I may do. The shell's masthead.
  'GET /me': {
    sql: `select person, display_name, unit, role, granted_by, granted_at,
                 countersigned_by
          from cw.effective_role where person = current_setting('cw.actor')`,
    rule: 'cw.effective_role — a revoked or uncountersigned grant answers nothing',
  },

  // The requester's deals. Scoped by cw.agreement's read_own policy: a
  // requester sees their own; Legal and Audit see all; a viewer sees none.
  'GET /deals': {
    sql: `select agreement_id, counterparty, requester, status
          from cw.agreement order by agreement_id`,
    rule: 'cw.agreement read_own policy',
  },

  // What is waiting on Legal. Ordered oldest first because the desk exists to
  // make the oldest wait visible — sort order is a control, not a preference.
  // Columns corrected in WP-U11: this shipped naming `clause_id`, `version` and
  // `opened_at`, none of which cw.review_ticket has — a ticket names a CATEGORY,
  // not a clause, because the whole point is that the proposed text has not
  // become a clause yet. The endpoint failed outright for anybody with a ticket
  // to see, and nobody noticed because the seeded system had none. Found by a
  // check that runs every read endpoint's SQL against the migrated schema.
  'GET /waiting/tickets': {
    sql: `select ticket_id, agreement_id, category_key, severity, reason_code,
                 provenance_badge, state, opened_by, created_at
          from cw.review_ticket where state = 'pending'
          order by created_at`,
    rule: 'cw.review_ticket read_scoped policy',
  },

  // The countersign queue. Read by everyone; only a Legal admin can act on it.
  'GET /waiting/countersign': {
    sql: `select grant_id, person, display_name, unit, role, proposed_by,
                 proposed_at, reason
          from cw.countersign_pending`,
    rule: 'cw.countersign_pending — grants that confer nothing while they sit here',
  },

  // People and access. Everyone may read it: access is not a secret, and it
  // carries role names rather than contract content.
  'GET /people': {
    sql: `select a.person, a.display_name, a.unit, a.role as declared_role,
                 a.state, a.created_by, a.created_at,
                 e.role as effective_role, e.countersigned_by
          from cw.account a
          left join cw.effective_role e on e.person = a.person
          order by a.person`,
    rule: 'cw.account read_all policy; effectiveness from cw.effective_role',
  },

  // The people pane. Distinct from /people, which is the plain list everyone may
  // read: this carries activity, and activity comes from the audit chain, whose
  // policy scopes a requester to their own rows. Granted to the three roles that
  // already read the whole chain, so a requester asking gets an honest refusal
  // rather than everybody's names with a null last act beside them.
  'GET /people/activity': {
    sql: `select person, display_name, unit, declared_role, state, created_by,
                 created_at, effective_role, granted_by, granted_at,
                 countersigned_by, last_act_at, last_act, acts_recorded,
                 activity_state
          from cw.person_activity order by person`,
    rule: 'granted to administrator, auditor and legal_admin — it reads the chain',
  },

  'GET /people/summary': {
    sql: `select * from cw.access_summary`,
    rule: 'cw.access_summary; shared_accounts is structurally zero',
  },

  'GET /access-history': {
    sql: `select grant_id, action, person, role, grant_ref, acted_by, acted_at,
                 reason, is_bootstrap
          from cw.role_grant order by grant_id desc`,
    rule: 'cw.role_grant read_all policy — append-only, so this is the whole story',
  },

  'GET /settings': {
    sql: `select key, value, kind, is_owner_decision, decided, decided_by,
                 rationale, purpose, updated_at
          from cw.governance_setting order by kind, key`,
    rule: 'cw.governance_setting read_all policy; writing is split by kind',
  },

  'GET /health': {
    sql: `select tile, state, as_of, detail from cw.health_summary`,
    rule: 'granted to administrator and auditor only',
  },

  'GET /watchers': {
    sql: `select watcher_id, category_key, person, added_by, added_at,
                 removed_by, removed_at
          from cw.override_watcher where removed_at is null
          order by category_key nulls first, person`,
    rule: 'cw.override_watcher read_all policy',
  },

  'GET /watchers/coverage': {
    sql: `select category_key, label, watcher_count from cw.watcher_coverage`,
    rule: 'cw.watcher_coverage — a zero is a visible gap, not a silence',
  },

  'GET /overrides': {
    sql: `select request_id, run_id, agreement_id, requested_by, requested_at,
                 state, justification, commercial_pressure, socialised_at,
                 window_closes, notified_count, window_closed, findings, decided,
                 approved
          from cw.override_status order by requested_at desc`,
    rule: 'cw.override_request read_scoped — a requester sees their own, Legal '
        + 'and Audit see all, a viewer sees only what they were told about',
  },

  'GET /overrides/findings': {
    sql: `select request_id, finding_ref, severity, summary, decision,
                 decided_by, decided_at, note
          from cw.override_finding order by request_id, finding_ref`,
    rule: 'cw.override_finding read_scoped — the decision lives per finding',
  },

  'GET /overrides/notified': {
    sql: `select request_id, person, reason from cw.override_notified
          order by request_id, person`,
    rule: 'cw.override_notified read_scoped — who was told, and why',
  },

  // ── The review desk (WP-U11) ────────────────────────────────────────────
  'GET /tickets': {
    sql: `select ticket_id, agreement_id, category_key, severity, reason_code,
                 provenance_badge, proposed_text, state, approved_text,
                 edited_before_approval, decided_by, decided_on, decision_note,
                 minted_clause_id, minted_version, opened_by, created_at
          from cw.review_ticket order by created_at`,
    rule: 'cw.review_ticket read_scoped policy; oldest first is the desk\'s job',
  },

  'GET /quality': {
    sql: `select * from cw.review_quality`,
    rule: 'cw.review_quality — the unedited-approval rate, measured and shown',
  },

  'GET /origin-mix': {
    sql: `select * from cw.library_origin_mix`,
    rule: 'cw.library_origin_mix — where the library actually came from',
  },

  // ── The library (WP-U13) ────────────────────────────────────────────────
  'GET /clauses': {
    sql: `select clause_id, category_key, severity from cw.clause order by clause_id`,
    rule: 'cw.clause read_all policy — reading clause text is not the risk',
  },

  'GET /clause-versions': {
    sql: `select clause_id, version, title, body, rationale, reviewer,
                 approved_on, expires_on, retired, provenance, origin,
                 source_ticket_id
          from cw.clause_version order by clause_id, version`,
    rule: 'cw.clause_version read_all policy',
  },

  'GET /entrance': {
    sql: `select clause_id, version, provenance, source_ticket_id, reviewer,
                 entrance from cw.clause_entrance order by clause_id, version`,
    rule: 'cw.clause_entrance — where every version came from, including UNACCOUNTED',
  },

  'GET /concessions': {
    sql: `select s.concession_id, s.agreement_id, s.category_key, s.proposer_kind,
                 s.state, s.settled_by, s.settled_on,
                 c.standard_clause_id, c.standard_version, c.conceded_rung, c.reason
          from cw.concession_state s
          join cw.concession c using (concession_id)
          order by s.concession_id`,
    rule: 'cw.concession read_scoped policy; the state is derived, never stored',
  },

  'GET /holds': {
    sql: `select hold_id, agreement_id, matter_ref, opened_by, opened_on,
                 released_on, released_by from cw.legal_hold order by hold_id`,
    rule: 'cw.legal_hold policies',
  },

  'GET /retention/due': {
    sql: `select agreement_id, retention_until, under_hold, matters
          from cw.retention_due order by retention_until`,
    rule: 'cw.retention_due, granted to administrator — due-ness and identity, '
        + 'never agreement bodies. Destruction stays legal_admin\'s act',
  },

  // The auditor's chain explorer. Scoped by cw.audit_event's own policy: an
  // auditor, reviewer or legal admin sees the whole record; a requester sees
  // only their own acts; a viewer holds no grant on the table at all. The
  // filtering the console offers happens over what the policy already returned.
  'GET /record': {
    sql: `select seq, ts, actor, actor_role, actor_kind, event_type, subject,
                 payload
          from cw.audit_event order by seq desc limit 500`,
    rule: 'cw.audit_event audit_read_scoped policy',
  },
};

// A database refusal reported as what it is. The message comes from the
// database and is passed through UNCHANGED — those messages name the rule and
// the role ("X is an owner decision and only a legal admin may change it"), and
// rewording them here would replace an accurate sentence with a vaguer one and
// then have to be kept in step with the schema forever.
// Classified by SQLSTATE, not by reading the message.
//
// Message-matching was the first attempt and it was wrong in a way worth
// recording: it looked for "permission denied" and "row-level security", which
// catches the refusals Postgres words itself and misses every refusal the
// SCHEMA words — and those are the good ones. "X is an owner decision and only a
// legal admin may change it" was being reported as a 400 bad request, because
// the sentence a human wrote does not contain the phrase a regex was looking
// for. The schema raises those with `errcode = 'insufficient_privilege'`
// deliberately; reading the code respects that and needs no maintenance as more
// rules are written.
//
// 42501 covers privilege errors, row-level security violations, and every
// schema-raised refusal that names insufficient_privilege.
function refusal(e) {
  const msg = String(e?.message ?? 'refused');
  const denied = e?.code === '42501'
    || /permission denied|row-level security/i.test(msg);
  return {
    status: denied ? 403 : 400,
    body: { error: 'refused', reason: msg },
  };
}

export class App {
  #db; #sessions;

  constructor(db, { now = () => Date.now() } = {}) {
    this.#db = db;
    this.#sessions = new Sessions({ now });
  }

  get sessions() { return this.#sessions; }

  // Resolve the caller: session → person → the role the database says they
  // hold right now. Every request, every time. Nothing is cached, which is what
  // makes revocation bite at the next request rather than the next sign-in.
  async #caller(token) {
    const person = this.#sessions.personFor(token);
    if (!person) return { error: { status: 401, body: { error: 'no session' } } };

    const rows = await this.#db.lookUpIdentity(({ query }) =>
      query(`select role from cw.effective_role where person = $1`, [person]));
    if (!rows.length) {
      // Revoked, or a Legal grant still waiting on its countersign. Both mean
      // the same thing and the message says so rather than guessing which.
      this.#sessions.endAllFor(person);
      return { error: { status: 403, body: {
        error: 'refused',
        reason: 'this account holds no effective role — it has been revoked, or '
              + 'its grant of a Legal role is still waiting to be countersigned',
      } } };
    }
    return { person, role: rows[0].role };
  }

  async #sessionLength() {
    const rows = await this.#db.lookUpIdentity(({ query }) =>
      query(`select value from cw.governance_setting where key = 'session_length'`));
    return parseDuration(rows[0]?.value, EIGHT_HOURS);
  }

  // ── Sign in ──────────────────────────────────────────────────────────────
  // No password. This is the seam an identity provider plugs into, and it is
  // marked as a seam rather than dressed up as authentication — see the
  // handoff. What is real here, and what the rest of the system relies on, is
  // that the ROLE is never taken from the request: the person names themselves,
  // and the database says what that person may do.
  async signIn(person) {
    if (!person || !String(person).trim())
      return { status: 400, body: { error: 'name yourself' } };

    const rows = await this.#db.lookUpIdentity(({ query }) =>
      query(`select role, display_name, unit from cw.effective_role where person = $1`,
        [person]));
    if (!rows.length)
      return { status: 403, body: {
        error: 'refused',
        reason: 'no active account with an effective role for that person',
      } };

    const { token, expiresAt } = this.#sessions.issue(person, await this.#sessionLength());
    return { status: 200, body: {
      token, expiresAt,
      person, role: rows[0].role,
      display_name: rows[0].display_name, unit: rows[0].unit,
    } };
  }

  // ── Every other request ──────────────────────────────────────────────────
  async handle(method, path, { token = null, body = null } = {}) {
    if (method === 'POST' && path === '/sign-in')
      return this.signIn(body?.person);

    if (method === 'POST' && path === '/sign-out') {
      this.#sessions.end(token);
      return { status: 200, body: { ok: true } };
    }

    const caller = await this.#caller(token);
    if (caller.error) return caller.error;

    const read = READS[`${method} ${path}`];
    if (read) {
      try {
        const rows = await this.#db.asPerson(caller.person, caller.role,
          ({ query }) => query(read.sql));
        return { status: 200, body: { rows } };
      } catch (e) { return refusal(e); }
    }

    // `this.mutations` is an override the test suite installs to exercise the
    // machinery — the pool bleed, the error path, the refusal shape — without
    // depending on which real endpoints happen to exist. Real endpoints come
    // from MUTATIONS and are the ones that ship.
    const write = this.mutations?.[`${method} ${path}`] ?? MUTATIONS[`${method} ${path}`];
    if (write) {
      try {
        // Note what is NOT passed to run(): nothing that could carry an actor.
        // The person is already bound to the connection by asPerson, and every
        // handler that records who acted reads it back with
        // current_setting('cw.actor'). There is nowhere to put a different name.
        const rows = await this.#db.asPerson(caller.person, caller.role,
          ({ query }) => write.run(query, body ?? {}));
        return { status: 200, body: { rows } };
      } catch (e) { return refusal(e); }
    }

    return { status: 404, body: { error: 'no such endpoint', path } };
  }
}

export { READS, refusal };
