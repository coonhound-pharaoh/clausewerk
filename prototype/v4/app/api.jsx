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
  let token = null;
  let identity = null;

  async function call(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }

    if (res.ok) return { ok: true, rows: payload?.rows ?? [], body: payload };

    // A refusal is passed up as what it is, with the DATABASE's own sentence.
    // Those sentences name the rule and the role — "X is an owner decision and
    // only a legal admin may change it" — and replacing one with "You do not
    // have permission" would throw away the only part a person can act on.
    return {
      ok: false,
      status: res.status,
      reason: payload?.reason ?? payload?.error ?? `the request failed (${res.status})`,
      expired: res.status === 401,
    };
  }

  return {
    get session() { return identity; },
    get signedIn() { return token !== null; },

    async signIn(person) {
      const res = await fetch(base + '/sign-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ person }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) return { ok: false, reason: payload?.reason ?? 'sign-in failed' };
      token = payload.token;
      identity = {
        person: payload.person, role: payload.role,
        display_name: payload.display_name, unit: payload.unit,
      };
      return { ok: true, identity };
    },

    async signOut() {
      if (token) await call('POST', '/sign-out');
      token = null; identity = null;
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
    overrides:        () => call('GET', '/overrides'),
    overrideFindings: () => call('GET', '/overrides/findings'),
    overrideNotified: () => call('GET', '/overrides/notified'),
    retentionDue:     () => call('GET', '/retention/due'),
    record:           () => call('GET', '/record'),

    // ── Writes. Each one act. ───────────────────────────────────────────
    openDeal:      (b) => call('POST', '/deals', b),
    openTicket:    (b) => call('POST', '/tickets', b),
    verifyTicket:  (b) => call('POST', '/tickets/verify', b),
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
    takeCheckpoint:() => call('POST', '/checkpoints', {}),
    runCheck:      (which) => call('POST', `/health-checks/${which}`, {}),
  };
})();
