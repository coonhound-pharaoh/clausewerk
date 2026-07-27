// Administrator console II — settings, health, watchers (WP-U09),
// and the Auditor's access history.
//
// THREE RULES, and the first is the one this file exists to get right.
//
//   1. THERE IS NO EDIT AFFORDANCE ON AN OWNER DECISION. Not a disabled input,
//      not a greyed-out button, not a field that fails on save. The boundary is
//      taught by the screen: an administrator looking at an owner decision must
//      see something that was never theirs to change, not something they are
//      currently forbidden from changing. A disabled editor says "you could,
//      but not now"; read-only text says "this belongs to somebody else".
//
//   2. NEVER-RAN IS ITS OWN STATE. A tile that renders green because a check has
//      never run is absence of evidence rendered as evidence, and it is how a
//      system reassures its operator into an incident.
//
//   3. THE NUDGE NOTIFIES AND DESTROYS NOTHING. It writes an audit row saying
//      Legal was told. It touches no retention state at all, and it cannot —
//      the administrator holds no write on that table.

const { useState, useMemo } = React;

// ── Settings ─────────────────────────────────────────────────────────────
function OperationalRow({ s, onSaved, onError }) {
  const [value, setValue] = useState(s.value);
  const [busy, setBusy] = useState(false);
  const dirty = value !== s.value;

  return (
    <div className="waiting-row">
      <div className="min-w-0">
        <div className="text-[13px] font-mono" style={{ color: 'var(--ink)' }}>{s.key}</div>
        <div className="caption mt-0.5">{s.purpose}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          className="font-mono" style={{ width: 110, padding: '4px 8px' }}
          value={value} onChange={(e) => setValue(e.target.value)}
          data-testid={`setting-${s.key}`}
        />
        <button
          className="btn btn-sm" disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true); onError(null);
            const r = await API.setSetting({ key: s.key, value });
            setBusy(false);
            if (!r.ok) { onError(r.reason); setValue(s.value); return; }
            onSaved();
          }}
        >{busy ? 'saving…' : 'save'}</button>
      </div>
    </div>
  );
}

// An owner decision, rendered as what it is: somebody else's settled choice,
// with the reasoning attached. NO INPUT ELEMENT APPEARS HERE AT ALL.
function OwnerDecisionRow({ s }) {
  return (
    <div className="waiting-row" data-testid={`owner-decision-${s.key}`}>
      <div className="min-w-0">
        <div className="text-[13px] font-mono" style={{ color: 'var(--ink)' }}>
          {s.key}
          <span className="ml-3" style={{ color: 'var(--accent)' }}>
            {s.value === '' ? '(deliberately unset)' : s.value}
          </span>
        </div>
        {/* The reasoning, not just the value. A decision recorded without its
            why is a value somebody will "correct" later. */}
        <div className="caption mt-1" style={{ lineHeight: 1.6 }}>{s.rationale}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-start">
        {s.decided
          ? <span className="chip chip-ok" title={`decided by ${s.decided_by}`}>
              decided · {s.decided_by}
            </span>
          // Undecided rows are FLAGGED, not hidden. An open question the system
          // has answered provisionally is exactly the thing somebody needs to
          // see; hiding it makes the provisional answer look settled.
          : <span className="chip chip-pending">undecided</span>}
      </div>
    </div>
  );
}

function SettingsPane({ me }) {
  const pane = usePane(() => API.settings());
  const [error, setError] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const operational = pane.rows.filter((s) => s.kind === 'operational');
  const decisions   = pane.rows.filter((s) => s.kind === 'owner_decision');
  const undecided   = decisions.filter((s) => !s.decided);

  return (
    <div>
      {error && (
        <div className="panel p-3 mb-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      <PanelHead
        title="Operational settings"
        sub="How the machine is tuned. Changing any of these cannot change a contract outcome."
      />
      <div className="panel">
        {operational.map((s) => (
          <OperationalRow key={s.key} s={s} onSaved={pane.reload} onError={setError} />
        ))}
      </div>

      <div className="mt-8">
        <PanelHead
          title="Owner decisions"
          sub="What the business has chosen. These are Legal admin's, and you are reading them."
          right={undecided.length > 0
            ? <span className="chip chip-pending">{undecided.length} undecided</span>
            : null}
        />
        {/*
          NO EDIT AFFORDANCE. Not a disabled field — nothing that looks like an
          editor at all. A disabled input says "you could, but not now"; text
          says "this was never yours". The boundary is taught by the screen, and
          the server would refuse anyway, which is exactly why the screen must
          not imply otherwise.
        */}
        <div className="panel">
          {decisions.map((s) => <OwnerDecisionRow key={s.key} s={s} />)}
        </div>
        <div className="caption mt-2">
          {me.role === 'administrator'
            ? 'These belong to Legal admin. You see the value, who decided it and why; changing one is their act.'
            : 'Editing these is done in the governance pane of the library workspace.'}
        </div>
      </div>
    </div>
  );
}

// ── System health ────────────────────────────────────────────────────────
function HealthPane() {
  const tiles = usePane(() => API.health());
  const due   = usePane(() => API.retentionDue());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  if (tiles.status === 'loading') return <Loading />;
  if (tiles.status === 'failed') return <LoadFailed reason={tiles.reason} />;

  const run = async (which, fn) => {
    setBusy(which); setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setError(r.reason); else { tiles.reload(); due.reload(); }
  };

  // never_ran is visibly its own thing — dashed, muted, and worded as a
  // question rather than an answer.
  const chip = (state) => {
    if (state === 'pass')     return <span className="chip chip-ok">verified</span>;
    if (state === 'fail')     return <span className="chip chip-err">failed</span>;
    if (state === 'due')      return <span className="chip chip-pending">due</span>;
    if (state === 'none due') return <span className="chip chip-std">none due</span>;
    return <span className="chip chip-unknown">never run</span>;
  };

  return (
    <div>
      {error && (
        <div className="panel p-3 mb-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      <PanelHead
        title="System health"
        sub="Evidence, not decoration. A tile is verified only when a check actually ran."
      />
      <div className="panel">
        {tiles.rows.map((t) => (
          <div className="waiting-row" key={t.tile} data-testid={`tile-${t.tile.replace(/\s/g, '-')}`}>
            <div className="min-w-0">
              <div className="text-[13px]" style={{ color: 'var(--ink)' }}>{t.tile}</div>
              {t.detail && <div className="caption mt-0.5" style={{ lineHeight: 1.6 }}>{t.detail}</div>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {chip(t.state)}
              <span className="waiting-age">{t.as_of ? since(t.as_of) : 'not yet'}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-4">
        <button className="btn" disabled={busy === 'checkpoint'}
                onClick={() => run('checkpoint', () => API.takeCheckpoint())}>
          ▶ take a checkpoint
        </button>
        <button className="btn" disabled={busy === 'anchor'}
                onClick={() => run('anchor', () => API.runCheck('anchor'))}>
          ▶ check the anchor
        </button>
        <button className="btn" disabled={busy === 'chain'}
                onClick={() => run('chain', () => API.runCheck('chain'))}>
          ▶ verify the chain
        </button>
      </div>
      <div className="caption mt-2">
        Each of these records that it ran, whichever way it comes out. A check
        that failed and a check nobody has run are different facts, and the
        tiles above show them differently.
      </div>

      {/* ── Retention: visible here, and yours to action ───────────────────
          Owner decision U9 (0022) moved destruction to the Administrator and
          REVOKED Legal admin's right rather than sharing it. This copy said
          "Legal admin's recorded act" until 2026-07-27 — telling the one
          person who can act that they cannot, which is exactly the mistake
          0022 was written to stop. No screen performs the act yet; what is
          corrected here is who it belongs to. */}
      <div className="mt-8">
        <PanelHead
          title="Retention coming due"
          sub="You can see what is due. Destroying it is your own recorded act — no screen offers it yet."
        />
        {due.status === 'failed' ? <LoadFailed reason={due.reason} /> : (
          <WaitingList
            items={(due.rows ?? []).map((r) => ({
              key: r.agreement_id,
              title: r.agreement_id,
              sub: r.under_hold
                ? `due ${r.retention_until} · held`
                : `due ${r.retention_until}`,
              at: null,
              chips: (
                <>
                  {/* Held and due are different states and must never render
                      alike — that distinction is what stops a destruction
                      being attempted on something frozen.
                      THE MATTER IS NOT SHOWN, and that is owner decision U13
                      (0024): the Administrator is told that a record is held,
                      not why. Asking Legal is the intended next step, and the
                      refusal itself names the matter to whoever attempts the
                      act. Do not add it back here as a convenience. */}
                  {r.under_hold
                    ? <span className="chip chip-err">held</span>
                    : <span className="chip chip-pending">due</span>}
                  <button
                    className="btn btn-sm"
                    data-testid={`nudge-${r.agreement_id}`}
                    onClick={async () => {
                      setError(null);
                      const n = await API.nudgeRetention({
                        agreement_id: r.agreement_id,
                        note: 'past its retention date',
                      });
                      if (!n.ok) setError(n.reason);
                    }}
                  >record a reminder</button>
                </>
              ),
            }))}
            empty={<Empty kicker="retention" line="Nothing is past its retention date."
                          sub="When something is, it appears here for you to act on." />}
          />
        )}
        <div className="caption mt-2">
          <strong>The reminder records that this was seen.</strong> It changes no
          retention state and destroys nothing — nothing here destroys anything
          on a timer, by decision, so this button could not become a delete even
          if somebody rewired it.
        </div>
      </div>
    </div>
  );
}

// ── Watchers ─────────────────────────────────────────────────────────────
function WatchersPane() {
  const watchers = usePane(() => API.watchers());
  const coverage = usePane(() => API.watcherCoverage());
  const people   = usePane(() => API.people());
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('');
  const [person, setPerson] = useState('');

  if (watchers.status === 'loading') return <Loading />;
  if (watchers.status === 'failed') return <LoadFailed reason={watchers.reason} />;
  // The coverage read is checked too, and this one is the dangerous half.
  // Defaulting its rows to an empty list turned a FAILED read into "no gaps",
  // so the uncovered-categories banner never rendered — the screen read as
  // though every category had a watcher. The watchers list loads separately
  // and looked fine, so nothing appeared wrong at all.
  // cw.watcher_coverage exists so that "a zero is a visible gap, not a
  // silence"; swallowing the failure turned it back into a silence.
  if (coverage.status === 'failed') return <LoadFailed reason={coverage.reason} />;
  if (coverage.status === 'loading') return <Loading />;

  const gaps = coverage.rows.filter((c) => c.watcher_count === 0);

  const reload = () => { watchers.reload(); coverage.reload(); };

  return (
    <div>
      {error && (
        <div className="panel p-3 mb-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      {/* The gap, surfaced. An override request touching a category with nobody
          watching it is not "nobody to tell" — it is a hole in the
          socialisation, and the system's job ends at making it visible. */}
      {gaps.length > 0 && (
        <div className="panel p-4 mb-6" style={{ borderColor: 'var(--accent-2)' }}>
          <div className="tag" style={{ color: 'var(--accent-2)' }}>uncovered categories</div>
          <div className="font-serif italic mt-1.5" style={{ fontSize: 16, color: 'var(--ink)' }}>
            {gaps.length} categor{gaps.length === 1 ? 'y has' : 'ies have'} nobody
            watching {gaps.length === 1 ? 'it' : 'them'}.
          </div>
          <div className="caption mt-2" style={{ lineHeight: 1.6 }}>
            An override request in{' '}
            <span className="font-mono">{gaps.map((g) => g.category_key).join(', ')}</span>{' '}
            would be socialised to nobody. Add a watcher, or an always-watcher who
            sees every category.
          </div>
        </div>
      )}

      <PanelHead
        title="Watchers"
        sub="Who is told when an override is requested. Never who decides it."
      />
      <div className="panel">
        {watchers.rows.map((w) => (
          <div className="waiting-row" key={w.watcher_id}>
            <div>
              <div className="text-[13px]" style={{ color: 'var(--ink)' }}>{w.person}</div>
              <div className="caption mt-0.5">added by {w.added_by}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="chip chip-std">
                {w.category_key ?? 'every category'}
              </span>
              <button className="btn btn-sm"
                      onClick={async () => {
                        setError(null);
                        const r = await API.removeWatcher({ watcher_id: w.watcher_id });
                        if (!r.ok) setError(r.reason); else reload();
                      }}>remove</button>
            </div>
          </div>
        ))}
        {watchers.rows.length === 0 && (
          <div className="p-4">
            <Empty kicker="watchers" line="Nobody is watching anything yet."
                   sub="Every override request would be socialised to nobody at all." />
          </div>
        )}
      </div>

      <div className="panel p-4 mt-6">
        <PanelHead title="Add a watcher" sub="Leave the category blank for somebody who watches everything." />
        <div className="flex gap-2 items-end">
          <div style={{ width: 180 }}>
            <label className="section-label">Category</label>
            <select className="mt-1.5 w-full font-mono" value={category}
                    onChange={(e) => setCategory(e.target.value)}>
              <option value="">every category</option>
              {coverage.rows.map((c) => (
                <option key={c.category_key} value={c.category_key}>{c.category_key}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 260 }}>
            <label className="section-label">Person</label>
            <select className="mt-1.5 w-full font-mono" value={person}
                    onChange={(e) => setPerson(e.target.value)}>
              <option value="">choose somebody</option>
              {(people.rows ?? []).filter((p) => p.state === 'active').map((p) => (
                <option key={p.person} value={p.person}>{p.person}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" disabled={!person}
                  onClick={async () => {
                    setError(null);
                    const r = await API.addWatcher({
                      category_key: category || null, person,
                    });
                    if (!r.ok) setError(r.reason); else { setPerson(''); reload(); }
                  }}>✓ add</button>
        </div>
        <div className="caption mt-3">
          Adding somebody here gives them <em>sight</em> of an override request.
          It gives them no vote in it — deciding is Legal's, always.
        </div>
      </div>
    </div>
  );
}

// ── Access history, for the Auditor ──────────────────────────────────────
function AccessHistoryPane() {
  const pane = usePane(() => API.accessHistory());
  const [who, setWho] = useState('');
  const [action, setAction] = useState('');

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  // Filtering happens over rows the POLICY already returned. That is the
  // difference between a filter and a leak: nothing here narrows a fetch that
  // was broader than this reader is entitled to — the fetch was already scoped.
  const rows = pane.rows.filter((g) =>
    (!who || g.person.includes(who) || (g.acted_by ?? '').includes(who))
    && (!action || g.action === action));

  const csv = () => {
    const head = ['grant_id','action','person','role','acted_by','acted_at','reason','bootstrap'];
    const body = rows.map((g) => head.map((k) => {
      const v = k === 'bootstrap' ? g.is_bootstrap : g[k];
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'access-history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <PanelHead
        title="Access history"
        sub="Every act on somebody's access, in order. Append-only, so this is the whole story."
        right={<button className="btn btn-sm" onClick={csv} data-testid="export-access">
          ↓ export csv
        </button>}
      />

      <div className="flex gap-2 mb-3">
        <input className="font-mono" style={{ width: 240, padding: '5px 9px' }}
               placeholder="filter by person" value={who}
               onChange={(e) => setWho(e.target.value)} />
        <select className="font-mono" style={{ padding: '5px 9px' }} value={action}
                onChange={(e) => setAction(e.target.value)}>
          <option value="">every act</option>
          <option value="granted">granted</option>
          <option value="countersigned">countersigned</option>
          <option value="revoked">revoked</option>
        </select>
        <div className="caption self-center">
          {rows.length} of {pane.rows.length}
        </div>
      </div>

      <WaitingList
        items={rows.map((g) => ({
          key: g.grant_id,
          title: `${g.action} · ${g.person} · ${g.role}`,
          sub: `by ${g.acted_by}${g.reason ? ` — ${g.reason}` : ''}${g.is_bootstrap ? ' · bootstrap' : ''}`,
          at: g.acted_at,
          chips: <span className={`chip ${g.action === 'revoked' ? 'chip-err'
            : g.action === 'countersigned' ? 'chip-ok' : 'chip-std'}`}>{g.action}</span>,
        }))}
        empty={<Empty kicker="access history" line="Nothing matches that."
                      sub="Clear the filters to see the whole story." />}
      />
    </div>
  );
}
