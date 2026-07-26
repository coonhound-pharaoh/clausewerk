// The chrome: sign-in, the masthead, the per-role tab row, the footer.
//
// THE PRINCIPLE THE WHOLE THING HANGS ON
//
//     The screen mirrors the database. What a role cannot do, its workspace does
//     not show — and what its workspace does not show, the database would refuse
//     anyway.
//
// The second half is what makes the first half a control rather than a
// decoration. Hiding a tab is cosmetic; anybody can type a URL. So the tab sets
// below decide what is OFFERED, and every pane behind them is fed by a
// role-scoped endpoint that would refuse the wrong caller on its own. Typing
// another role's address reaches a refusal state having fetched nothing,
// because there is no call in this app that fetches broadly.

const { useState, useEffect, useCallback } = React;

// ── The six workspaces (architecture §3, owner decision U8) ──────────────
// This table IS the specification. The acceptance test asserts the rendered tab
// set matches it exactly for each role, so a tab added here without a pane, or
// a pane added without a tab, is caught rather than discovered.
const WORKSPACES = {
  requester: {
    workspace: 'My deals',
    opensOn: 'Their engagements only, each with its stage, and what is waiting on them',
    tabs: [
      { key: 'my-deals',  label: 'my deals' },
      { key: 'intake',    label: 'intake' },
      { key: 'negotiate', label: 'negotiate' },
      { key: 'my-record', label: 'my record' },
    ],
  },
  legal_reviewer: {
    workspace: 'Review desk',
    opensOn: 'Everything waiting on Legal judgement, oldest first',
    tabs: [
      { key: 'review-desk',  label: 'review desk' },
      { key: 'tickets',      label: 'tickets' },
      { key: 'approvals',    label: 'approvals' },
      { key: 'negotiations', label: 'negotiations' },
      { key: 'holds',        label: 'holds' },
    ],
  },
  legal_admin: {
    workspace: 'The library',
    opensOn: 'The vault, the ladders and the rules — and everything a reviewer sees',
    tabs: [
      { key: 'library',     label: 'the library' },
      { key: 'ladders',     label: 'ladders & rules' },
      { key: 'governance',  label: 'governance' },
      { key: 'retention',   label: 'holds & retention' },
      { key: 'review-desk', label: 'review desk' },
    ],
  },
  auditor: {
    workspace: 'The record',
    opensOn: 'The full chain, verified status, and the history of who was granted what',
    tabs: [
      { key: 'the-record',     label: 'the record' },
      { key: 'quality',        label: 'quality' },
      { key: 'origin-mix',     label: 'origin mix' },
      { key: 'access-history', label: 'access history' },
    ],
  },
  viewer: {
    workspace: 'Reading room',
    opensOn: 'Just the agreements shared with them',
    tabs: [
      { key: 'reading-room', label: 'reading room' },
    ],
  },
  administrator: {
    workspace: 'Administration',
    opensOn: 'People and access, and the health of the record',
    tabs: [
      { key: 'people',   label: 'people & access' },
      { key: 'settings', label: 'settings' },
      { key: 'health',   label: 'system health' },
      { key: 'watchers', label: 'watchers & notices' },
    ],
  },
};

// ── Sign in ───────────────────────────────────────────────────────────────
// The front door, in the same visual language as everything behind it.
//
// It asks for a name and nothing else, and says so plainly. Dressing a
// development doorway up as authentication — a password box that accepts
// anything — would be a screen claiming a control that does not exist, which is
// the failure class this rebuild is paying down.
function SignIn({ onSignedIn }) {
  const [person, setPerson] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!person.trim() || busy) return;
    setBusy(true); setReason(null);
    const r = await API.signIn(person.trim());
    setBusy(false);
    if (r.ok) onSignedIn(r.identity); else setReason(r.reason);
  };

  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="signin-card">
        <div className="flex items-center gap-3 mb-1">
          <span className="monogram">CW</span>
          <div className="flex flex-col justify-center">
            <span className="wordmark leading-none">Clausewerk</span>
            <span className="caption leading-none mt-0.5"
                  style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mute-2)' }}>
              Procurement contract assembly
            </span>
          </div>
        </div>

        <div className="font-serif italic mt-5" style={{ fontSize: 17, color: 'var(--mute)' }}>
          Sign in as yourself.
        </div>
        <div className="caption mt-2" style={{ lineHeight: 1.6 }}>
          Your workspace is built from what your role can actually read. Nobody
          chooses a role here — the system looks up the one you hold.
        </div>

        <form onSubmit={submit} className="mt-5">
          <label className="section-label" htmlFor="person">Who are you</label>
          <input
            id="person" className="mt-2 font-mono" autoFocus autoComplete="off"
            placeholder="name@clausewerk"
            value={person} onChange={(e) => setPerson(e.target.value)}
          />
          <button type="submit" className="btn btn-primary mt-4 w-full justify-center"
                  disabled={busy || !person.trim()}>
            {busy ? 'signing in…' : 'sign in'}
          </button>
        </form>

        {reason && (
          <div className="mt-4 panel-2 p-3">
            <div className="tag" style={{ color: 'var(--accent-2)' }}>refused</div>
            {/* The service's own sentence, unchanged. It says whether the
                account is unknown, revoked, or holding a Legal grant nobody has
                countersigned — all three are actionable, and "sign-in failed"
                is not. */}
            <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{reason}</div>
          </div>
        )}

        <div className="caption mt-6" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, lineHeight: 1.6 }}>
          There is no password yet. This is a development doorway, and it is
          labelled as one rather than made to look like more than it is. What is
          already real: your role is never taken from anything this page sends.
        </div>
      </div>
    </div>
  );
}

// ── The masthead ──────────────────────────────────────────────────────────
function Masthead({ identity, onSignOut }) {
  const ws = WORKSPACES[identity.role];
  return (
    <div className="flex items-center justify-between px-6 border-b hair" style={{ height: 54 }}>
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-3">
          <span className="monogram">CW</span>
          <div className="flex flex-col justify-center">
            <span className="wordmark leading-none">Clausewerk</span>
            <span className="caption leading-none mt-0.5"
                  style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mute-2)' }}>
              {ws.workspace}
            </span>
          </div>
        </div>
        <div className="h-6 w-px" style={{ background: 'var(--line-2)' }}></div>
        <div className="text-[13px] truncate" style={{ color: 'var(--mute)' }}>{ws.opensOn}</div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Acting as. Not decoration: it answers "whose eyes am I looking
            through", and in this system that decides what can be fetched at
            all. It belongs in the masthead rather than behind a menu. */}
        <div className="acting" data-testid="acting-as">
          <span className="text-[12.5px]" style={{ color: 'var(--ink)' }}>
            {identity.display_name || identity.person}
          </span>
          <span className="acting-role" data-testid="acting-role">{identity.role}</span>
        </div>
        <button className="btn btn-sm" onClick={onSignOut}>sign out</button>
      </div>
    </div>
  );
}

// ── The tab row ───────────────────────────────────────────────────────────
// Only this role's tabs, because only this role's panes will load. Hiding the
// others is not the control — the endpoints are — but showing them would be a
// promise the system will not keep.
function Tabs({ role, active, onSelect }) {
  const tabs = WORKSPACES[role].tabs;
  return (
    <div className="flex items-center gap-6 px-6 border-b hair" style={{ height: 42 }}
         data-testid="tab-row">
      {tabs.map((t) => (
        <button
          key={t.key}
          data-testid={`tab-${t.key}`}
          className={`tab-btn${active === t.key ? ' active' : ''}`}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Footer({ identity, note }) {
  return (
    <div className="flex items-center justify-between px-6 border-t hair"
         style={{ height: 28, fontSize: 11, color: 'var(--mute-2)' }}>
      <div className="font-mono">{identity.person}{identity.unit ? ` · ${identity.unit}` : ''}</div>
      <div>{note}</div>
    </div>
  );
}
