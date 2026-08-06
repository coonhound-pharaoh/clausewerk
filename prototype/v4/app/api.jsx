// The only way this page talks to the system.
//
// TWO RULES, and the second is the one the frontend handoff warns about.
//
//   1. Every call carries the session token and nothing else about identity.
//      The browser never sends a role, never sends an actor. It cannot: there
//      is no parameter here to put one in, and the service would ignore it if
//      there were.
//
//   2. NO PANE FETCHES BROADLY AND FILTERS ON SCREEN. That is the named leak —
//      data a role may not see arriving in the browser and being hidden by
//      JavaScript is not a control, it is a control-shaped decoration. Every
//      function below maps to one role-scoped endpoint. If a workspace needs a
//      narrower slice, that is a read model request on the backend.
//
// There is deliberately no generic `get(path)` exported for a pane to call with
// whatever it likes. The endpoint list is right here, it is short, and adding to
// it is a visible act.

const API = (() => {
  // Same origin. The service serves this page, so there is no base URL to
  // configure and no cross-origin rule to relax.
  const base = '/api';
  const sessionRoles = new Set([
    'requester', 'legal_reviewer', 'legal_admin',
    'auditor', 'viewer', 'administrator',
  ]);
  let token = null;
  let identity = null;

  const unreachable = () => ({
    ok: false, status: 0, reason: 'the service could not be reached',
    unreachable: true,
  });
  const unreadable = (status) => ({
    ok: false, status, reason: 'the service returned an unreadable response',
    invalidResponse: true,
  });
  const failureReason = (payload, fallback) => {
    for (const candidate of [payload?.reason, payload?.error]) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    return fallback;
  };

  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { return unreachable(); }
    let payload;
    try { payload = await res.json(); }
    catch { return res.ok ? unreadable(res.status) : {
      ok: false, status: res.status,
      reason: `the request failed (${res.status})`,
      expired: res.status === 401,
    }; }

    if (res.ok && (payload === null || typeof payload !== 'object'
        || Array.isArray(payload))) return unreadable(res.status);
    if (res.ok && Object.prototype.hasOwnProperty.call(payload, 'rows')
        && !Array.isArray(payload.rows)) return unreadable(res.status);

    if (res.ok) return { ok: true, rows: payload?.rows ?? [], body: payload };

    // A refusal is passed up as what it is, with the DATABASE's own sentence.
    // Those sentences name the rule and the role — "X is an owner decision and
    // only a legal admin may change it" — and replacing one with "You do not
    // have permission" would throw away the only part a person can act on.
    return {
      ok: false,
      status: res.status,
      reason: failureReason(payload, `the request failed (${res.status})`),
      expired: res.status === 401,
    };
  }

  // A reply that is a FILE rather than a record.
  //
  // THIS FUNCTION OWNS TRANSPORT AND REFUSAL-SHAPING, AND NOTHING ELSE. It
  // fetches, carries the token, reads the bytes and the filename, and turns a
  // non-ok reply into exactly the shape `call` returns — so a refused download
  // arrives as a sentence somebody can read rather than as a broken file on
  // their desktop.
  //
  // IT DOES NOT SAVE THE FILE. Building the anchor, making the object URL,
  // setting the download name and revoking it afterwards all belong to the ONE
  // screen that downloads, and that split is checked rather than trusted:
  // db/test/shell.test.mjs asserts this file contains no createElement('a'),
  // and that only the requester's screen names the helper below. ADR-0008 gave
  // the viewer no export path, and it survives precisely because the saving
  // step lives in one screen instead of in the transport every screen uses.
  async function download(path) {
    let res;
    try {
      res = await fetch(base + path, {
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
    } catch { return unreachable(); }
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      return {
        ok: false,
        status: res.status,
        reason: failureReason(payload, `the request failed (${res.status})`),
        expired: res.status === 401,
      };
    }
    const disposition = res.headers.get('content-disposition') || '';
    const named = /filename="([^"]+)"/.exec(disposition);
    let blob;
    try { blob = await res.blob(); }
    catch { return unreachable(); }
    return { ok: true, blob, filename: named ? named[1] : 'contract.docx' };
  }

  // A request whose BODY is a document rather than a record — the mirror of
  // `download`, and the third and last shape this transport knows.
  //
  // The file is sent as raw bytes with its own content type, NOT as multipart
  // form data, because that is the shape the service reads: server.py decides
  // "this is a document" from the content type not being JSON, and takes the
  // claimed name from a content-disposition header. Wrapping it in a form
  // would arrive as a document whose bytes are a MIME envelope, and the
  // fingerprint the schema computes would be the fingerprint of the envelope.
  //
  // The name is sent exactly as the person's own file carried it. This layer
  // does not sanitise it — the service refuses the names it cannot accept, in
  // words, which is better than two layers quietly disagreeing about what the
  // file was called.
  async function send(path, file) {
    let res;
    try {
      res = await fetch(base + path, {
        method: 'POST',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'content-disposition':
            `attachment; filename="${String(file.name || '').replace(/["\r\n]/g, '')}"`,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
    } catch { return unreachable(); }
    let payload;
    try { payload = await res.json(); }
    catch { return res.ok ? unreadable(res.status) : {
      ok: false, status: res.status,
      reason: `the upload failed (${res.status})`,
      expired: res.status === 401,
    }; }
    if (res.ok && (payload === null || typeof payload !== 'object'
        || Array.isArray(payload))) return unreadable(res.status);
    if (res.ok) return { ok: true, body: payload };
    return {
      ok: false,
      status: res.status,
      reason: failureReason(payload, `the upload failed (${res.status})`),
      expired: res.status === 401,
    };
  }

  return {
    get session() { return identity; },
    get signedIn() { return token !== null; },

    async signIn(person) {
      let res;
      try {
        res = await fetch(base + '/sign-in', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ person }),
        });
      } catch { return unreachable(); }
      let payload;
      try { payload = await res.json(); }
      catch { return res.ok ? unreadable(res.status) : {
        ok: false, status: res.status, reason: 'sign-in failed',
      }; }
      if (res.ok && (payload === null || typeof payload !== 'object'
          || Array.isArray(payload))) return unreadable(res.status);
      if (!res.ok) return { ok: false, reason: failureReason(payload, 'sign-in failed') };
      if (![payload.token, payload.person, payload.role, payload.display_name].every(
          (value) => typeof value === 'string' && value.trim())) {
        return unreadable(res.status);
      }
      if (!sessionRoles.has(payload.role)) return unreadable(res.status);
      if (payload.unit !== null && payload.unit !== undefined
          && typeof payload.unit !== 'string') return unreadable(res.status);
      token = payload.token;
      identity = {
        person: payload.person, role: payload.role,
        display_name: payload.display_name, unit: payload.unit,
      };
      return { ok: true, identity };
    },

    async signOut() {
      try {
        if (token) await call('POST', '/sign-out');
      } catch {
        // Remote cleanup is best-effort. Re-throwing here prevents App's
        // onSignOut callback from clearing the visible workspace even though
        // this function destroys the only browser-held credential below.
      } finally {
        // Signing out is first a local security act. A network failure may
        // leave the server-side session to expire, but it must never leave the
        // bearer credential active in this page after the person signed out.
        token = null; identity = null;
      }
    },

    // Called when any request comes back 401. The session is gone — expired, or
    // the person was revoked — and the honest thing is to return to the front
    // door rather than leave a workspace on screen that can no longer load.
    forget() { token = null; identity = null; },

    // ── Reads. One function, one role-scoped endpoint. ──────────────────
    me:               () => call('GET', '/me'),
    deals:            () => call('GET', '/deals'),
    waitingTickets:   () => call('GET', '/waiting/tickets'),
    countersignQueue: () => call('GET', '/waiting/countersign'),
    people:           () => call('GET', '/people'),
    peopleActivity:   () => call('GET', '/people/activity'),
    accessSummary:    () => call('GET', '/people/summary'),
    accessHistory:    () => call('GET', '/access-history'),
    settings:         () => call('GET', '/settings'),
    health:           () => call('GET', '/health'),
    watchers:         () => call('GET', '/watchers'),
    watcherCoverage:  () => call('GET', '/watchers/coverage'),
    tickets:          () => call('GET', '/tickets'),
    quality:          () => call('GET', '/quality'),
    originMix:        () => call('GET', '/origin-mix'),
    clauses:          () => call('GET', '/clauses'),
    clauseVersions:   () => call('GET', '/clause-versions'),
    entrance:         () => call('GET', '/entrance'),
    concessions:      () => call('GET', '/concessions'),
    holds:            () => call('GET', '/holds'),
    overrides:        () => call('GET', '/overrides'),
    overrideFindings: () => call('GET', '/overrides/findings'),
    overrideNotified: () => call('GET', '/overrides/notified'),
    retentionDue:     () => call('GET', '/retention/due'),
    record:           () => call('GET', '/record'),

    // ── The reading room (WP-U14) ───────────────────────────────────────
    // NEITHER TAKES A PARAMETER, and that is the control rather than an
    // oversight. WP-U14's critical anti-pattern is the viewer's render being
    // fetched through anything broader than "this share, this person" — and an
    // agreement_id argument is precisely how that happens: the moment the
    // browser can name what it wants, the scoping is a careful query rather
    // than a rule. cw.reading_room scopes itself in its own WHERE clause, from
    // the connection's identity, so there is nothing here to pass.
    //
    // THERE IS NO EXPORT HERE AND THERE MUST NOT BE. ADR-0008 gave the viewer
    // no export deliberately: the reading room shows a contract to somebody
    // outside the deal, and letting them take a copy away is a different act
    // nobody decided. 0017 leaves nothing in the schema for one to call and the
    // doorway asserts no such route exists. Convenience does not amend an ADR.
    readingRoom:        () => call('GET', '/reading-room'),
    readingRoomClauses: () => call('GET', '/reading-room/clauses'),

    // ── Notices, and the intake question set they are raised about ──────
    notices:         () => call('GET', '/notices'),
    // People being waited on whom no channel can reach. It has existed since
    // OB-09 with no screen behind it — which is the same shape as the intake
    // gaps: a fact the record holds and nobody was looking at.
    notificationGap: () => call('GET', '/notifications/gap'),
    noticeRoutes:    () => call('GET', '/notice-routes'),
    intakeCoverage:  () => call('GET', '/intake/coverage'),
    intakeCoverageSummary: () => call('GET', '/intake/coverage/summary'),

    // ── The negotiation record ──────────────────────────────────────────
    // SIX READS, NONE OF WHICH TAKES A PARAMETER, for the reading room's
    // reason: the scoping is "these deals, this person" and it is already on
    // the connection. A screen showing one negotiation filters what the rule
    // returned; it does not ask for one by name.
    negotiations:       () => call('GET', '/negotiations'),
    negotiationRounds:  () => call('GET', '/negotiations/rounds'),
    positions:          () => call('GET', '/negotiations/positions'),
    positionMovements:  () => call('GET', '/negotiations/movements'),
    revivals:           () => call('GET', '/negotiations/revivals'),
    renewalDrift:       () => call('GET', '/negotiations/drift'),
    roundAnalysis:      () => call('GET', '/negotiations/analysis'),
    riskAssessments:    () => call('GET', '/risk/assessments'),

    // ── Reporting (RP-01…RP-04) ─────────────────────────────────────────
    // Management surfaces. The GRANT is the control: legal_admin and the
    // auditor get rows, everyone else gets the database's refusal, rendered
    // as the sentence it is. The friction scorecard is the exception — a
    // requester reads it at intake, on purpose.
    reportVelocity:    () => call('GET', '/reports/velocity'),
    reportContested:   () => call('GET', '/reports/contested'),
    reportQueue:       () => call('GET', '/reports/queue'),
    reportReviewers:   () => call('GET', '/reports/reviewers'),
    reportExposure:    () => call('GET', '/reports/exposure'),
    reportPolicyShift: () => call('GET', '/reports/policy-shift'),
    vendorFriction:    () => call('GET', '/vendors/friction'),
    ticketRoute:       () => call('GET', '/tickets/route'),

    // ── The library and the ladders (WP-U13) ────────────────────────────
    library:          () => call('GET', '/library'),
    ladders:          () => call('GET', '/ladders'),
    rules:            () => call('GET', '/rules'),
    recordsDelegates: () => call('GET', '/records-delegates'),
    redactionState:   () => call('GET', '/redaction-state'),
    // The obligations surfaces (OB-11/OB-15). One derivation feeds the panel
    // and the digest, so screen and email cannot disagree.
    waiting:          () => call('GET', '/waiting'),
    obligationsBook:  () => call('GET', '/obligations'),
    obligationGaps:   () => call('GET', '/obligations/gaps'),
    outbox:           () => call('GET', '/notifications/outbox'),
    envelopes:        () => call('GET', '/envelopes'),

    // ── Assembly runs ───────────────────────────────────────────────────
    // NONE OF THESE THREE TAKES A PARAMETER, for the reading room's reason:
    // the scoping is "these runs, this person" and it comes from the identity
    // on the connection. A screen that wants one run filters what the rule
    // already returned.
    runs:             () => call('GET', '/runs'),
    runDecisions:     () => call('GET', '/runs/decisions'),
    runFindings:      () => call('GET', '/runs/findings'),

    // AND THIS ONE DOES, which is the exception and needs its argument made.
    // A run is the caller's OWN artefact, named by an id the server generated
    // and which the database's own rule already decided they may see — not a
    // share scoped by somebody else's identity, which is the case the reading
    // room refused. The endpoint resolves the id through the run table first
    // and treats "no such run of yours" as a refusal, so naming one you may
    // not have gets a sentence and no bytes.
    //
    // THIS IS NOT A PRECEDENT FOR THE READING ROOM. Those two still take no
    // argument and must not start.
    contract:  (runId) => download('/runs/contract?run=' + encodeURIComponent(runId)),

    // AND SO DOES THIS ONE, on the same argument and with the same fence.
    // Owner decision NI-4 (2026-08-05): the counterparty's document may be
    // read back by everyone who can read the deal. It names a ROUND, not a
    // document — the round's read policy decides, and a round that is not the
    // caller's answers a sentence and no bytes. The viewer still has no export
    // path of any kind (ADR-0008), and this does not become one.
    supplierPaper: (negotiationId, roundNo) => download(
      '/negotiations/paper?negotiation=' + encodeURIComponent(negotiationId)
      + '&round=' + encodeURIComponent(roundNo)),

    // ── Writes. Each one act. ───────────────────────────────────────────
    addCategory:   (b) => call('POST', '/categories', b),
    // The pre-flight and the act. THE PRE-FLIGHT HAS NEVER BEEN CALLED FROM
    // ANYWHERE until now — it has existed and been tested since the engine was
    // first connected, with no screen behind it — so this is the first time its
    // refusals are rendered to a person.
    // The deterministic intake (AI-1). The walk answers a RECORD — a version
    // and a set of probes — not a list of rows, which is why usePane learned
    // to hold a body.
    intakeProbes:   () => call('GET', '/intake/probes'),
    classifyIntake: (b) => call('POST', '/intake/classify', b),
    checkManifest: (b) => call('POST', '/manifests/check', b),
    recordRun:     (b) => call('POST', '/runs', b),
    executeAgreement: (b) => call('POST', '/agreements/execute', b),
    openDeal:      (b) => call('POST', '/deals', b),
    openHold:      (b) => call('POST', '/holds', b),
    openTicket:    (b) => call('POST', '/tickets', b),
    verifyTicket:  (b) => call('POST', '/tickets/verify', b),
    claimTicket:   (b) => call('POST', '/tickets/claim', b),
    releaseClaim:  (b) => call('POST', '/tickets/claim/release', b),
    rejectTicket:  (b) => call('POST', '/tickets/reject', b),
    createAccount: (b) => call('POST', '/accounts', b),
    revokeAccount: (b) => call('POST', '/accounts/revoke', b),
    grant:         (b) => call('POST', '/grants', b),
    countersign:   (b) => call('POST', '/grants/countersign', b),
    revokeGrant:   (b) => call('POST', '/grants/revoke', b),
    setSetting:    (b) => call('POST', '/settings', b),
    decideSetting: (b) => call('POST', '/settings/decide', b),
    addWatcher:    (b) => call('POST', '/watchers', b),
    removeWatcher: (b) => call('POST', '/watchers/remove', b),
    // Four acts, four calls. There is deliberately no decideAll: the endpoint
    // takes one finding, and a helper here that looped over them would be the
    // blanket acknowledge button rebuilt in the browser.
    requestOverride:   (b) => call('POST', '/overrides', b),
    socialiseOverride: (b) => call('POST', '/overrides/socialise', b),
    decideOverride:    (b) => call('POST', '/overrides/decide', b),
    openOverrideGate:  (b) => call('POST', '/overrides/gate', b),
    nudgeRetention:(b) => call('POST', '/retention/nudge', b),
    // The governed library acts (D-5, NC-21/22/23). Each one act; the
    // authority is the schema's, and every refusal renders as its sentence.
    retireClause:      (b) => call('POST', '/library/retire', b),
    supersedeClause:   (b) => call('POST', '/library/supersede', b),
    publishRule:       (b) => call('POST', '/rules', b),
    retireRule:        (b) => call('POST', '/rules/retire', b),
    promoteConcession: (b) => call('POST', '/concessions/promote', b),
    moveFloor:         (b) => call('POST', '/ladders/floor', b),
    publishLadder:     (b) => call('POST', '/ladders/publish', b),
    releaseHold:       (b) => call('POST', '/holds/release', b),
    destroyRetention:  (b) => call('POST', '/retention/destroy', b),
    redactAgreement:   (b) => call('POST', '/agreements/redact', b),
    purgeAgreement:    (b) => call('POST', '/agreements/purge', b),
    grantRecordsDelegate:  (b) => call('POST', '/records-delegates', b),
    revokeRecordsDelegate: (b) => call('POST', '/records-delegates/revoke', b),
    // The negotiation acts. EIGHT CALLS FOR EIGHT ACTS, and the two that look
    // like one act with a flag are two on purpose: opening from library
    // standard and opening from last term's executed positions are different
    // commercial decisions, and escalating is not "moving to the state
    // 'escalated'" — nobody should reach Legal by typing a string into a
    // field. There is no helper here that performs two of them together.
    openNegotiation:   (b) => call('POST', '/negotiations', b),
    openRenewal:       (b) => call('POST', '/negotiations/renew', b),
    recordRound:       (b) => call('POST', '/negotiations/rounds', b),
    openPosition:      (b) => call('POST', '/negotiations/positions', b),
    movePosition:      (b) => call('POST', '/negotiations/positions/move', b),
    escalatePosition:  (b) => call('POST', '/negotiations/positions/escalate', b),
    // The one act in this family whose body is a document. It names the deal
    // in the query string because its body IS the counterparty's file — there
    // is no record to carry the name.
    recordRedline: (agreementId, file) => send(
      '/negotiations/redline?agreement=' + encodeURIComponent(agreementId), file),
    concede:           (b) => call('POST', '/concessions', b),
    approveConcession: (b) => call('POST', '/concessions/approve', b),
    shareAgreement:        (b) => call('POST', '/shares', b),
    revokeShare:           (b) => call('POST', '/shares/revoke', b),
    // Raising what you observed, and closing one. TWO ACTS, TWO CALLS, and
    // deliberately no acknowledgeAll: the endpoint takes one notice, and a
    // helper here that looped over them would be a blanket clear button
    // rebuilt in the browser — the override findings' argument exactly.
    raiseNotice:       (b) => call('POST', '/notices', b),
    acknowledgeNotice: (b) => call('POST', '/notices/acknowledge', b),
    takeCheckpoint:() => call('POST', '/checkpoints', {}),
    runCheck:      (which) => call('POST', `/health-checks/${which}`, {}),
  };
})();
