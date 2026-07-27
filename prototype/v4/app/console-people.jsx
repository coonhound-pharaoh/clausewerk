// Administrator console I — people and access (WP-U08).
//
// The countersigned grant lifecycle, end to end: grant, countersign, revoke,
// every act visible on the chain.
//
// THREE RULES THIS SCREEN HAS TO GET RIGHT, and each is a critical failure if
// it does not:
//
//   1. A PENDING LEGAL GRANT MUST NEVER LOOK EFFECTIVE. Amber, not green. A
//      screen that shows a countersigned-pending grant as live is the
//      countersign rule undone in pixels — the administrator walks away
//      believing they have given somebody access, and nobody finds out until
//      that person cannot sign in.
//
//   2. REVOKE MUST NOT PROMISE MORE THAN THE SERVICE DELIVERS. WP-U05 promises
//      revocation is honoured at the NEXT REQUEST, not instantly: a request
//      already in flight completes. This screen says exactly that, and the copy
//      is load-bearing rather than decorative.
//
//   3. DORMANCY IS ABOUT ACTS, NOT SIGN-INS. Somebody who signs in every day
//      and does nothing is dormant where it matters. The read model measures it
//      from the audit chain; this screen must not re-describe it as "last seen".

const { useState } = React;

const ROLES = ['viewer', 'requester', 'auditor', 'legal_reviewer', 'legal_admin',
               'administrator'];
const LEGAL_ROLES = new Set(['legal_reviewer', 'legal_admin']);

// The one place a role name is turned into a sentence. Kept together so the
// screen cannot say "needs approval" in one spot and "pending" in another for
// the same state.
//
// PENDING IS DECIDED BY THE QUEUE, NOT INFERRED FROM THE ROLE. The first version
// of this function reasoned "a Legal role with no effective grant must be
// awaiting a countersign", which is wrong in the most misleading possible
// direction: somebody whose access had been REVOKED rendered as awaiting a
// second name. That reads as "almost there, somebody just needs to approve it"
// when the truth is the opposite — their access was deliberately taken away.
// Found by revoking a reviewer and looking at the screen.
//
// So the caller passes the set of genuinely pending people, straight from
// cw.countersign_pending, and the chip states what the record says rather than
// what the role implies.
function accessChip(p, pendingPeople) {
  if (p.state === 'revoked') return <span className="chip chip-err">revoked</span>;
  if (p.effective_role) return <span className="chip chip-ok">effective</span>;
  // AMBER, and only when a countersign really is outstanding. Never chip-ok,
  // and never merely a lighter green.
  if (pendingPeople.has(p.person))
    return <span className="chip chip-pending">awaiting countersign</span>;
  // No effective role and nothing pending: their grant was revoked, or they
  // never had one. Either way there is nobody to chase.
  return <span className="chip chip-unknown">no access</span>;
}

function activityChip(p) {
  if (p.activity_state === 'active') return null;
  if (p.activity_state === 'dormant')
    return <span className="chip chip-pending" title="No recorded act in 90 days">dormant</span>;
  if (p.activity_state === 'never acted')
    return <span className="chip chip-unknown" title="This account has never done anything">never used</span>;
  return null;
}

// ── The countersign queue ────────────────────────────────────────────────
// ONE component, rendered in TWO places: the administrator's console, where the
// person who proposed the grant can see what they are waiting on, and the Legal
// reviewer's and Legal admin's own review desk, where the people who must clear
// it actually work.
//
// That second placement is the whole reason this is a shared component rather
// than a section of the console. A queue that lives only in the admin console —
// a screen Legal has no reason to open — is a queue that does not get cleared,
// and the countersign rule's entire cost is the wait it adds. ADR-0011 leans on
// this to keep that wait short.
function CountersignQueue({ me, rows, onDone, onError, showAdminNote }) {
  return (
    <div>
      <PanelHead
        title="Countersign queue"
        sub="Proposed Legal roles. Each confers nothing at all while it sits here."
      />
      <WaitingList
        items={rows.map((g) => ({
          key: g.grant_id,
          // BOTH NAMES on the row. Who is being granted what, and who proposed
          // it — a countersign is a second person's judgement about a first
          // person's proposal, and it cannot be given without seeing both.
          title: `${g.display_name || g.person} → ${g.role}`,
          sub: `proposed by ${g.proposed_by}${g.reason ? ` · ${g.reason}` : ''}`,
          at: g.proposed_at,
          chips: (
            <>
              <span className="chip chip-pending">pending</span>
              {me.role === 'legal_admin' && (
                <button
                  className="btn btn-sm"
                  data-testid={`countersign-${g.grant_id}`}
                  onClick={async () => {
                    onError(null);
                    const r = await API.countersign({ grant_id: g.grant_id });
                    if (!r.ok) onError(r.reason); else onDone();
                  }}
                >✓ countersign</button>
              )}
            </>
          ),
        }))}
        empty={<Empty
          kicker="countersign queue"
          line="Nothing is waiting for a second name."
          sub="Grants of the two Legal roles appear here until a Legal admin accepts them. Until then they confer nothing — not a lesser role, nothing." />}
      />
      {showAdminNote && rows.length > 0 && (
        <div className="caption mt-2">
          You cannot clear this queue yourself — that is the point of it. The same
          list is in every Legal admin's own workspace.
        </div>
      )}
    </div>
  );
}

// ── Grant ────────────────────────────────────────────────────────────────
function GrantForm({ people, onDone, onError }) {
  const [person, setPerson] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [role, setRole] = useState('requester');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = people.find((p) => p.person === person.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !person.trim() || !role) return;
    setBusy(true); onError(null);

    // TWO ACTS, NOT ONE, and deliberately not bundled behind a single button
    // press that reports one outcome. Creating an account and granting a role
    // are separate recorded acts; if the second is refused, the first still
    // happened and the screen must be able to say so.
    if (!existing) {
      const made = await API.createAccount({
        person: person.trim(), display_name: name.trim() || person.trim(),
        unit: unit.trim() || null, role,
      });
      if (!made.ok) { setBusy(false); onError(made.reason); return; }
    }
    const granted = await API.grant({
      person: person.trim(), role, reason: reason.trim() || null,
    });
    setBusy(false);
    if (!granted.ok) { onError(granted.reason); return; }
    setPerson(''); setName(''); setUnit(''); setReason('');
    onDone();
  };

  return (
    <form onSubmit={submit} className="panel p-4">
      <PanelHead
        title="Grant access"
        sub="One person, one role. A second role is a revoke and a grant, both recorded."
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="section-label">Person</label>
          <input className="mt-1.5 w-full font-mono" placeholder="name@clausewerk"
                 value={person} onChange={(e) => setPerson(e.target.value)} />
        </div>
        <div>
          <label className="section-label">Name</label>
          <input className="mt-1.5 w-full" placeholder="Their name"
                 value={name} onChange={(e) => setName(e.target.value)}
                 disabled={!!existing} />
        </div>
        <div>
          <label className="section-label">Unit</label>
          <input className="mt-1.5 w-full" placeholder="Procurement"
                 value={unit} onChange={(e) => setUnit(e.target.value)}
                 disabled={!!existing} />
        </div>
        <div>
          <label className="section-label">Role</label>
          <select className="mt-1.5 w-full font-mono" value={role}
                  onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="section-label">Why</label>
        <input className="mt-1.5 w-full" placeholder="Joining the contracts team"
               value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {/* Said BEFORE the button, not after the fact. Somebody granting a Legal
          role needs to know it will not take effect yet — otherwise they tell
          the new joiner they are set up, and the joiner cannot sign in. */}
      {LEGAL_ROLES.has(role) && (
        <div className="mt-3 panel-2 p-3">
          <div className="tag" style={{ color: 'var(--accent-2)' }}>takes two names</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)', lineHeight: 1.6 }}>
            This grant will confer <strong>nothing at all</strong> until a Legal
            admin countersigns it. They will not be able to sign in until then.
            Access to Legal judgement is itself a Legal judgement.
          </div>
        </div>
      )}

      {existing && (
        <div className="caption mt-3">
          {existing.person} already has an account. This grants them a role;
          it does not create a second account.
        </div>
      )}

      <button className="btn btn-primary mt-4" type="submit"
              disabled={busy || !person.trim()}>
        {busy ? 'recording…' : '✓ grant'}
      </button>
    </form>
  );
}

// ── Revoke ───────────────────────────────────────────────────────────────
function RevokeDialog({ person, grantId, onClose, onDone, onError }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="panel p-4 mt-4">
      <PanelHead title={`Revoke ${person}`}
                 sub="A revocation is a new row, never an edit. It cannot be undone." />
      <label className="section-label">Why</label>
      <input className="mt-1.5 w-full" autoFocus placeholder="Left the company"
             value={reason} onChange={(e) => setReason(e.target.value)} />

      {/* The copy that must not over-promise. WP-U05 delivers revocation at the
          NEXT REQUEST, and this screen says so rather than implying the person
          is thrown out mid-keystroke. The test asserts this sentence is here. */}
      <div className="panel-2 p-3 mt-3">
        <div className="tag">what happens</div>
        <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)', lineHeight: 1.6 }}>
          Their role stops applying <strong>at their next request</strong>. A
          request already in flight will finish. If they have a page open it will
          keep showing what it has already loaded until they touch anything —
          then they are signed out.
          <br /><br />
          Bringing them back later is a new grant, recorded as one.
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button className="btn" onClick={onClose}>cancel</button>
        <button
          className="btn btn-primary"
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true); onError(null);
            const r = await API.revokeGrant({ grant_id: grantId, reason: reason.trim() });
            setBusy(false);
            if (!r.ok) { onError(r.reason); return; }
            onDone();
          }}
        >
          {busy ? 'recording…' : '✓ revoke'}
        </button>
      </div>
    </div>
  );
}

// ── The pane ─────────────────────────────────────────────────────────────
function PeopleAndAccessConsole({ me }) {
  const activity = usePane(() => API.peopleActivity());
  const summary  = usePane(() => API.accessSummary());
  const queue    = usePane(() => API.countersignQueue());
  const history  = usePane(() => API.accessHistory());
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const reloadAll = () => {
    activity.reload(); summary.reload(); queue.reload(); history.reload();
  };

  if (activity.status === 'loading') return <Loading />;
  if (activity.status === 'failed') return <LoadFailed reason={activity.reason} />;

  const people = activity.rows;
  const s = summary.rows[0] ?? {};
  // Straight from cw.countersign_pending — the record of what is genuinely
  // outstanding, rather than an inference from the role somebody was given.
  const pendingPeople = new Set(
    (queue.status === 'loaded' ? queue.rows : []).map((g) => g.person));

  // The grant row a person's access hangs on, needed to revoke it. Taken from
  // the access history rather than held on the account, because the grant is
  // the thing being revoked and the account is not.
  //
  // NEWEST live grant, deliberately, because that is the one cw.effective_role
  // confers (0013: newest wins). The history arrives newest-first, and this
  // used to take the LAST element — the OLDEST live grant. With two live
  // grants (a normal state: granting a second role does not revoke the first)
  // the revoke succeeded, the dialog closed, and the person's effective role
  // was untouched: access the administrator believed removed was still live.
  const liveGrantFor = (person) => {
    if (history.status !== 'loaded') return null;
    const acts = history.rows.filter((g) => g.person === person);
    const granted = acts.filter((g) => g.action === 'granted');
    const revoked = new Set(acts.filter((g) => g.action === 'revoked').map((g) => g.grant_ref));
    const live = granted.filter((g) => !revoked.has(g.grant_id));
    return live.length ? live[0].grant_id : null;
  };

  return (
    <div>
      <TileStrip tiles={[
        { label: 'people with access', n: s.people_with_access },
        { label: 'awaiting countersign', n: s.awaiting_countersign },
        { label: 'dormant or never used', n: s.dormant },
        { label: 'revoked', n: s.revoked },
        // ADR-0008's residual, paid off and measured rather than hoped for.
        { label: 'shared accounts', n: s.shared_accounts },
      ]} />
      <div className="caption mt-2">
        Shared accounts is nought by construction — one row per named person is
        the accounts table's primary key, not a habit. Dormancy counts people
        with no <em>recorded act</em>, not people who have not signed in.
      </div>

      {error && (
        <div className="panel p-3 mt-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          {/* The database's own sentence, unchanged. It names the rule. */}
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      {queue.status === 'loaded' && (
        <div className="mt-6">
          <CountersignQueue
            me={me} rows={queue.rows}
            onDone={reloadAll} onError={setError}
            showAdminNote={me.role === 'administrator'}
          />
        </div>
      )}

      {/* The people table. */}
      <div className="mt-6">
        <PanelHead
          title="People and access"
          sub="Who holds what, who gave it to them, and when they last did anything."
        />
        <div className="panel">
          {people.map((p) => (
            <div className="waiting-row" key={p.person}>
              <div className="min-w-0">
                <div className="text-[13px] truncate" style={{ color: 'var(--ink)' }}>
                  {p.display_name}
                  <span className="font-mono ml-2" style={{ fontSize: 11, color: 'var(--mute-2)' }}>
                    {p.person}
                  </span>
                </div>
                <div className="caption mt-0.5 truncate">
                  {p.unit ? `${p.unit} · ` : ''}
                  granted by {p.granted_by || p.created_by}
                  {p.countersigned_by && ` · countersigned by ${p.countersigned_by}`}
                  {' · '}
                  {p.acts_recorded === 0
                    ? 'no recorded acts'
                    : `${p.acts_recorded} recorded act${p.acts_recorded === 1 ? '' : 's'}, last ${p.last_act || 'unknown'}`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="chip chip-std">{p.declared_role}</span>
                {accessChip(p, pendingPeople)}
                {activityChip(p)}
                <span className="waiting-age">
                  {p.last_act_at ? since(p.last_act_at) : '—'}
                </span>
                {/* No revoke button until the access history has actually
                    loaded. Without the history there is no grant to name, and
                    the button posted a null one — a baffling refusal about a
                    missing field, when the truth is the screen could not ask. */}
                {me.role === 'administrator' && p.state === 'active' && p.effective_role
                  && p.person !== me.person && history.status === 'loaded'
                  && liveGrantFor(p.person) && (
                  <button className="btn btn-sm"
                          onClick={() => setRevoking({ person: p.person, grantId: liveGrantFor(p.person) })}>
                    revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Nobody revokes themselves through this screen. Not a permission —
            the database would allow it — but an administrator who locks
            themselves out has to be recovered through the bootstrap path, and
            an accidental click should not cost that. */}
      </div>

      {revoking && (
        <RevokeDialog
          person={revoking.person}
          grantId={revoking.grantId}
          onClose={() => setRevoking(null)}
          onError={setError}
          onDone={() => { setRevoking(null); reloadAll(); }}
        />
      )}

      {me.role === 'administrator' && (
        <div className="mt-6">
          <GrantForm people={people} onDone={reloadAll} onError={setError} />
        </div>
      )}
    </div>
  );
}
