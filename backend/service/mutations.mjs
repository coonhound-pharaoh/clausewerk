// Every write that goes through the doorway, and the one thing they all share.
//
// THE RULE THIS FILE MAKES STRUCTURAL
//
//     There is no write endpoint that does not carry the session's actor.
//
// Not "we remember to attribute writes" — there is nowhere to put a different
// name. Nothing below takes an actor from the request body, and a test walks
// this file asserting that. The v3 prototype's unattributed override is
// therefore not a bug that was fixed; it is a shape that cannot be expressed.
//
// The attribution itself is not done here at all. `db.asPerson()` binds
// `cw.actor` to the session's person before the first statement, and the audit
// triggers in the schema read it. So a handler that simply performs the write
// is already attributed, and a handler that tried to attribute differently would
// have to fight the connection to do it.
//
// THREE THINGS EVERY ENTRY BELOW OBEYS:
//
//   1. ONE ACT PER ENDPOINT. No convenience endpoint bundles several governed
//      acts into one call. Each recorded act is one act; bundling blurs what was
//      approved, and an auditor reading the chain afterwards cannot tell which
//      of the bundled things the person actually looked at.
//   2. NO RETRY, EVER. Nothing here catches a refusal and tries again — not as a
//      different role, not on a different connection, not at all. A refusal is
//      the system working. "Making the demo work" by reissuing a refused write
//      is the single most damaging line anybody could add to this file.
//   3. NO PERMISSION CHECKS. Same as the reads: the database decides. Each entry
//      names the rule it defers to, and that note is documentation of where the
//      decision lives — not a decision being made here.

// A small helper for the endpoints that take a required, non-blank field. The
// schema already refuses blanks where it matters (a rejection needs a note, a
// justification cannot be boilerplate); this catches it one step earlier so the
// message names the field rather than the constraint.
const required = (body, field) => {
  const v = body?.[field];
  if (v === undefined || v === null || String(v).trim() === '')
    throw Object.assign(new Error(`${field} is required and cannot be blank`),
      { code: '23514' });
  return v;
};

export const MUTATIONS = {
  // ── Deals ───────────────────────────────────────────────────────────────
  'POST /deals': {
    rule: 'cw.agreement requester_writes policy — a requester opens their own deals',
    run: (query, body) => query(
      `insert into cw.agreement (agreement_id, counterparty, requester)
       values ($1, $2, current_setting('cw.actor'))
       returning agreement_id, counterparty, requester, status`,
      [required(body, 'agreement_id'), required(body, 'counterparty')]),
    // Note the requester column: it is the SESSION's person, not a value from
    // the body. A deal opened "on behalf of" somebody else would put the wrong
    // name on every scoping decision that follows from it.
  },

  // ── The review queue ────────────────────────────────────────────────────
  'POST /tickets': {
    rule: 'cw.review_ticket draft_writes/write_scoped policies; opened_by defaults '
        + 'to cw.app_actor()',
    run: (query, body) => query(
      `insert into cw.review_ticket
         (agreement_id, category_key, severity, reason_code, provenance_badge,
          proposed_text)
       values ($1,$2,$3,$4,$5,$6)
       returning ticket_id, state, opened_by, created_at`,
      [body.agreement_id ?? null,
       required(body, 'category_key'),
       required(body, 'severity'),
       required(body, 'reason_code'),
       required(body, 'provenance_badge'),
       required(body, 'proposed_text')]),
  },

  // Verifying and rejecting are TWO endpoints, not one with a `state` field,
  // and that is not a style preference.
  //
  // Verification MINTS a clause version. It is the act ADR-0003 calls the only
  // mutation surface for the library, and `cw.verify_review_ticket()` performs
  // it as one decision and one record — settling the version number before the
  // ticket moves so the minting guard has something to check against, and
  // checking its own rowcount because an UPDATE with no matching policy affects
  // nothing and raises nothing (finding D1). Rejection mints nothing and needs a
  // note.
  //
  // The first version of this file had one `/tickets/decide` endpoint doing a
  // raw UPDATE, which the database refused outright: a verified ticket must name
  // the clause it minted, and an UPDATE that sets `state = 'verified'` and
  // nothing else cannot. That refusal was the schema stopping the API from
  // inventing a second, weaker way to promote language — exactly what it is for.
  'POST /tickets/verify': {
    rule: 'cw.verify_review_ticket() — Legal only; mints the version; '
        + 'edited_before_approval is DERIVED from the two texts, never supplied',
    run: (query, body) => query(
      `select cw.verify_review_ticket($1,$2,$3,$4,$5,current_setting('cw.actor'),$6,$7,$8)
              as minted`,
      // p_body is what the reviewer is actually approving, and it is REQUIRED
      // rather than defaulted to the proposed text. Quietly substituting the
      // proposal when the field is absent would make every unedited approval a
      // fact the system invented rather than one it recorded — and the
      // unedited-approval-rate measurement (owner decision U4) is built on
      // precisely this column meaning what it says.
      [required(body, 'ticket_id'), required(body, 'approved_text'),
       required(body, 'new_clause_id'), required(body, 'title'),
       required(body, 'rationale'),
       body.expires_on ?? null,
       body.origin ?? 'legal_authored',
       body.note ?? null]),
  },

  'POST /tickets/reject': {
    rule: 'cw.reject_review_ticket(); rejection_needs_note refuses a blank note, '
        + 'and the empty string is what a form posts when nobody typed anything',
    run: (query, body) => query(
      `select cw.reject_review_ticket($1, current_setting('cw.actor'), $2) as rejected`,
      [required(body, 'ticket_id'), required(body, 'note')]),
  },

  // ── Concessions ─────────────────────────────────────────────────────────
  'POST /concessions': {
    rule: 'cw.concession write_scoped policy and cw.concession_requires_authority() '
        + '— the floor is absolute and vendor text needs an override',
    run: (query, body) => query(
      `insert into cw.concession
         (agreement_id, category_key, standard_clause_id, standard_version,
          conceded_rung, reason, approved_by, proposer_kind)
       values ($1,$2,$3,$4,$5,$6,current_setting('cw.actor'),'human')
       returning concession_id`,
      [required(body, 'agreement_id'), required(body, 'category_key'),
       required(body, 'standard_clause_id'), required(body, 'standard_version'),
       body.conceded_rung ?? null, required(body, 'reason')]),
    // proposer_kind is hard-coded 'human' because this endpoint is reached
    // through a session held by a person. A machine proposal is a different
    // path with a different actor_kind, and letting the body choose would make
    // "a machine may propose, only people settle" a claim the caller decides.
  },

  'POST /concessions/approve': {
    rule: 'cw.approval_names_the_right_person() — an approval must be from the '
        + 'requester, the assigned attorney, or a configured approver',
    run: (query, body) => query(
      `insert into cw.concession_approval (concession_id, approver_kind, approver)
       values ($1, $2, current_setting('cw.actor'))
       returning concession_id, approver_kind, approver`,
      [required(body, 'concession_id'), required(body, 'approver_kind')]),
  },

  // ── Overrides (ADR-0008, WP-U10) ────────────────────────────────────────
  //
  // FOUR ENDPOINTS FOR FOUR ACTS, and the shape is the control. Note what is
  // absent: there is no endpoint that decides a whole request. Deciding takes a
  // single finding reference, and there is no variant taking a list — a batch
  // endpoint that iterated approvals would be the blanket acknowledge button
  // with a for-loop in front of it, and the person pressing it would not have
  // seen each finding.
  'POST /overrides': {
    rule: 'cw.open_override_request() — requester only; the justification cannot '
        + 'be blank or boilerplate; a request opens no gate',
    run: (query, body) => query(
      `select cw.open_override_request($1,$2,$3::jsonb,$4) as request_id`,
      [required(body, 'run_id'), required(body, 'justification'),
       JSON.stringify(required(body, 'findings')),
       body.commercial_pressure ?? null]),
  },

  'POST /overrides/socialise': {
    rule: 'cw.socialise_override_request() — refuses when nobody would be told, '
        + 'because recording that as sent would put a lie in the record',
    run: (query, body) => query(
      `select cw.socialise_override_request($1) as notified`,
      [required(body, 'request_id')]),
  },

  'POST /overrides/decide': {
    rule: 'cw.decide_override_finding() — Legal only, ONE finding, and never '
        + 'before the review window closes',
    run: (query, body) => query(
      `select cw.decide_override_finding($1,$2,$3,$4)`,
      [required(body, 'request_id'), required(body, 'finding_ref'),
       required(body, 'decision'),
       body.decision === 'rejected' ? required(body, 'note') : (body.note ?? null)]),
  },

  'POST /overrides/gate': {
    rule: 'cw.record_override_gate() — refuses unless that finding is actually '
        + 'in cw.override_passes',
    run: (query, body) => query(
      `select cw.record_override_gate($1,$2)`,
      [required(body, 'request_id'), required(body, 'finding_ref')]),
  },

  // ── Holds ───────────────────────────────────────────────────────────────
  'POST /holds': {
    rule: 'cw.legal_hold policies — opening a hold is Legal\'s act',
    run: (query, body) => query(
      `insert into cw.legal_hold (agreement_id, matter_ref, opened_by)
       values ($1, $2, current_setting('cw.actor'))
       returning hold_id, agreement_id, matter_ref`,
      [required(body, 'agreement_id'), required(body, 'matter_ref')]),
  },

  // ── People and access (the administrator's console) ────────────────────
  'POST /accounts': {
    rule: 'cw.account administrator_creates policy',
    run: (query, body) => query(
      `insert into cw.account (person, display_name, unit, role, created_by)
       values ($1,$2,$3,$4,current_setting('cw.actor'))
       returning person, display_name, unit, role, state`,
      [required(body, 'person'), required(body, 'display_name'),
       body.unit ?? null, required(body, 'role')]),
  },

  'POST /accounts/revoke': {
    rule: 'cw.account administrator_maintains policy; cw.account_provenance_immutable() '
        + 'refuses un-revoking',
    run: (query, body) => query(
      `update cw.account
          set state = 'revoked',
              revoked_by = current_setting('cw.actor'),
              revoked_at = now()
        where person = $1
      returning person, state, revoked_by`,
      [required(body, 'person')]),
  },

  'POST /grants': {
    rule: 'cw.role_grant administrator_grants policy and cw.role_grant_rules() — '
        + 'nobody grants themselves a role, and acted_by comes from the connection',
    run: (query, body) => query(
      `insert into cw.role_grant (action, person, role, reason)
       values ('granted', $1, $2, $3)
       returning grant_id, person, role, acted_by, acted_at`,
      [required(body, 'person'), required(body, 'role'), body.reason ?? null]),
  },

  'POST /grants/countersign': {
    rule: 'cw.role_grant legal_admin_countersigns policy — decision U6. Only a '
        + 'Legal admin, never the subject, never the proposer',
    run: (query, body) => query(
      // person and role are overwritten from the grant being countersigned, so
      // the values here are placeholders the trigger replaces. They are passed
      // rather than left null only because the columns are NOT NULL; the
      // countersigner cannot change what is being countersigned.
      `insert into cw.role_grant (action, person, role, grant_ref)
       select 'countersigned', g.person, g.role, g.grant_id
         from cw.role_grant g where g.grant_id = $1
      returning grant_id, person, role, acted_by, acted_at`,
      [required(body, 'grant_id')]),
  },

  'POST /grants/revoke': {
    rule: 'cw.role_grant administrator_grants policy; append-only, so a revocation '
        + 'is a new row and never an edit',
    run: (query, body) => query(
      `insert into cw.role_grant (action, person, role, grant_ref, reason)
       select 'revoked', g.person, g.role, g.grant_id, $2
         from cw.role_grant g where g.grant_id = $1
      returning grant_id, person, role, acted_by`,
      [required(body, 'grant_id'), required(body, 'reason')]),
  },

  // ── Settings and watchers ───────────────────────────────────────────────
  'POST /settings': {
    rule: 'cw.setting_write_rules() — owner decisions are legal_admin\'s, '
        + 'operational rows are the administrator\'s, and the split cuts both ways',
    run: (query, body) => query(
      `update cw.governance_setting set value = $2 where key = $1
       returning key, value, kind, updated_at`,
      [required(body, 'key'), required(body, 'value')]),
  },

  'POST /settings/decide': {
    rule: 'cw.setting_write_rules(); a change to an owner decision carries its '
        + 'rationale, which is the whole value of the record',
    run: (query, body) => query(
      `update cw.governance_setting
          set value = $2, rationale = $3, decided = true,
              decided_by = current_setting('cw.actor')
        where key = $1
      returning key, value, decided_by, rationale`,
      [required(body, 'key'), required(body, 'value'), required(body, 'rationale')]),
  },

  'POST /watchers': {
    rule: 'cw.override_watcher administrator_maintains policy',
    run: (query, body) => query(
      `insert into cw.override_watcher (category_key, person, added_by)
       values ($1, $2, current_setting('cw.actor'))
       returning watcher_id, category_key, person`,
      [body.category_key ?? null, required(body, 'person')]),
  },

  'POST /watchers/remove': {
    rule: 'cw.override_watcher administrator_removes policy — a watcher is '
        + 'removed, never deleted, and the removal is audited',
    run: (query, body) => query(
      `update cw.override_watcher
          set removed_by = current_setting('cw.actor'), removed_at = now()
        where watcher_id = $1 and removed_at is null
      returning watcher_id, category_key, person, removed_by`,
      [required(body, 'watcher_id')]),
  },

  // The nudge. It NOTIFIES and it destroys nothing — that separation is the
  // whole point of the action existing.
  //
  // Retention makes records due; destroying them is Legal admin's act and the
  // Administrator holds no privilege to do it. Without a nudge the console
  // would show a growing list of overdue records and offer no way to act at
  // all, and the pressure to "just add a delete for the admin" would build with
  // every row. So the nudge is the pressure valve, and it is deliberately
  // nothing more than a recorded message: an audit row saying Legal was told,
  // on which date, by whom.
  //
  // It writes to the audit chain and to nothing else. There is no retention
  // column it could touch, because the administrator holds no update on
  // cw.agreement_retention — so this cannot become a destroy by accident or by
  // a later edit that "tidies it up".
  'POST /retention/nudge': {
    rule: 'insert on cw.audit_event only — the administrator holds no write on '
        + 'cw.agreement_retention, so a nudge cannot become a destruction',
    // $2 is cast explicitly. Without it Postgres cannot infer a type for a
    // parameter whose only use is inside jsonb_build_object, and refuses the
    // statement with "could not determine data type of parameter $2" — which
    // reaches the console as a refusal and reads like a permission problem.
    run: (query, body) => query(
      `select cw.audit('retention_nudged', $1,
         jsonb_build_object('note', $2::text,
                            'reminder', 'destruction is legal_admin''s act'))`,
      [required(body, 'agreement_id'), body.note ?? null]),
  },

  // ── Stewardship ─────────────────────────────────────────────────────────
  'POST /checkpoints': {
    rule: 'execute on cw.audit_checkpoint_take() — the administrator\'s duty '
        + 'since decision U7, and revoked from legal_admin',
    run: (query) => query(`select cw.audit_checkpoint_take() as checkpoint_id`),
  },

  'POST /health-checks/anchor': {
    rule: 'execute on cw.run_anchor_check(); the result is recorded whichever way '
        + 'it goes, because a check that ran is the evidence',
    run: (query) => query(`select cw.run_anchor_check() as result`),
  },

  'POST /health-checks/chain': {
    rule: 'execute on cw.run_chain_check()',
    run: (query) => query(`select cw.run_chain_check() as first_broken_seq`),
  },

  'POST /health-checks/document': {
    rule: 'cw.record_document_hash_check() compares against what was recorded at '
        + 'execution; the caller supplies what it read, never whether it matched',
    run: (query, body) => query(
      `select cw.record_document_hash_check($1,$2,$3) as result`,
      [required(body, 'agreement_id'), required(body, 'doc_seq'),
       required(body, 'observed_sha256')]),
  },

  'POST /health-checks/rebuild': {
    rule: 'cw.record_rebuild_spot_check() compares against cw.run.result_hash',
    run: (query, body) => query(
      `select cw.record_rebuild_spot_check($1,$2) as result`,
      [required(body, 'run_id'), required(body, 'observed_hash')]),
  },
};
