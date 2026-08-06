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
function HealthPane({ me }) {
  const tiles = usePane(() => API.health());
  const due   = usePane(() => API.retentionDue());
  const pipeline = usePane(() => API.redactionState());
  // The permitted raiser → recipient pairs (0064). Read once here and handed
  // to every raise control on this screen: what a role may raise is not a
  // secret, and asking once is one request rather than one per row.
  const routes = usePane(() => API.noticeRoutes());
  const gaps  = usePane(() => API.notificationGap());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [disposing, setDisposing] = useState(null); // { id, verb }

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
              {/* A FAILING OR NEVER-RUN CHECK IS RAISEABLE (NT-3). Watching a
                  tile go red and having nothing to do about it is exactly the
                  gap Mike named: the administrator observes, and until now
                  could only mention it in a corridor. */}
              {(t.state === 'fail' || t.state === 'never_ran') && (
                <RaiseNotice
                  me={me} routes={routes.rows}
                  subject={{ kind: 'health_tile', ref: t.tile,
                             about: `the ${t.tile} check` }} />
              )}
              {chip(t.state)}
              <span className="waiting-age">{t.as_of ? since(t.as_of) : 'not yet'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Who cannot be reached (OB-09's read, finally on a screen) ──────
          Empty is good news ONLY IF SOMEBODY IS LOOKING — cw.notification_gap's
          own words. This is somebody looking, and the act beside each row is
          how the fact gets to the people waiting on that person. */}
      {gaps.status === 'loaded' && gaps.rows.length > 0 && (
        <div className="mt-6">
          <PanelHead
            title="Being waited on, and unreachable"
            sub="Something is waiting on these people and no channel can deliver it. The address book is yours; who is waiting is not." />
          {gaps.rows.map((g) => (
            <div className="panel-2 p-3 mb-2 flex items-baseline justify-between"
                 key={g.person} data-testid="unreachable-person">
              <div>
                <span className="font-mono text-[12.5px]">{g.person}</span>
                <span className="ml-3 caption">{g.role}</span>
              </div>
              <RaiseNotice
                me={me} routes={routes.rows}
                subject={{ kind: 'notification_gap', ref: g.person,
                           about: `${g.person} being unreachable` }} />
            </div>
          ))}
        </div>
      )}

      {/* IN-2, owner decision NI-5: the intake question set, judged, in the
          administrator's workspace rather than a Legal one. */}
      <IntakeCoveragePane me={me} routes={routes.rows} />

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
          REVOKED Legal admin's right rather than sharing it. The act itself
          is offered below (D-5, 2026-08-02), behind the strongest
          confirmation idiom in the product: the record's own id, typed. */}
      <div className="mt-8">
        <PanelHead
          title="Retention coming due"
          sub="What is due, and the destroy act itself — never automatic, always yours, always recorded."
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
                  {r.under_hold ? (
                    /* Blocked BECAUSE HELD, and rendered that way — not a
                       greyed destroy that says "you could, but not now". The
                       hold is somebody else's decision to release. */
                    <span className="caption" data-testid={`blocked-${r.agreement_id}`}>
                      destroy is blocked while held — Legal knows the matter
                    </span>
                  ) : (
                    <button
                      className="btn btn-sm"
                      data-testid={`destroy-${r.agreement_id}`}
                      onClick={() => setDisposing(
                        disposing?.id === r.agreement_id && disposing?.verb === 'destroy'
                          ? null : { id: r.agreement_id, verb: 'destroy' })}
                    >destroy…</button>
                  )}
                </>
              ),
            }))}
            empty={<Empty kicker="retention" line="Nothing is past its retention date."
                          sub="When something is, it appears here for you to act on." />}
          />
        )}
        {disposing?.verb === 'destroy' && (
          <IrreversibleConfirm
            verb="destroy" agreementId={disposing.id}
            description={`Destroying ${disposing.id} is the retention decision, taken and
              recorded — the first of the two disposal acts. It is refused under any
              hold and before the retention date, and it cannot be undone.`}
            action={() => API.destroyRetention({ agreement_id: disposing.id })}
            onDone={(did) => { setDisposing(null); if (did) { due.reload(); pipeline.reload(); } }} />
        )}
        <div className="caption mt-2">
          <strong>The reminder records that this was seen.</strong> It changes no
          retention state and destroys nothing — nothing here destroys anything
          on a timer, by decision. The destroy act is separate, confirmed with
          the record's own id, and lands on the chain under your name.
        </div>
      </div>

      <DisposalPipeline pipeline={pipeline} due={due} disposing={disposing}
                        setDisposing={setDisposing} />
      <DelegatesDesk />
    </div>
  );
}

// ── The strongest confirmation idiom in the product ───────────────────────
// Typing the record's own id is deliberate friction proportionate to an
// irreversible act (WP-U13's anti-pattern: destruction must never be cheaper
// than a clause retirement). The refusal, if one comes, is the database's
// sentence — including the matter names on a hold, which is where U13 says
// they belong.
function IrreversibleConfirm({ verb, agreementId, description, action, onDone }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="panel p-3 mt-3" data-testid={`confirm-${verb}`}>
      <div className="section-label">{verb} {agreementId}</div>
      <div className="caption mt-1" style={{ whiteSpace: 'pre-wrap' }}>{description}</div>
      <div className="flex gap-2 mt-3 items-end">
        <div>
          <label className="section-label">Type the id to confirm</label>
          <input className="mt-1.5 font-mono" value={typed} placeholder={agreementId}
                 onChange={(e) => setTyped(e.target.value)}
                 data-testid={`type-to-${verb}`} />
        </div>
        <button className="btn" onClick={() => onDone(false)}>cancel</button>
        <button className="btn btn-primary"
                disabled={busy || typed.trim() !== agreementId}
                data-testid={`really-${verb}`}
                onClick={async () => {
                  setBusy(true); setError(null);
                  const r = await action();
                  setBusy(false);
                  if (!r.ok) { setError(r.reason); return; }
                  onDone(true);
                }}>
          {busy ? `${verb}ing…` : `✓ ${verb}, permanently`}
        </button>
      </div>
      {error && (
        <div className="panel p-3 mt-3" data-testid="disposal-error">
          <div className="section-label">refused</div>
          <div className="caption mt-1">{error}</div>
        </div>
      )}
    </div>
  );
}

// ── The disposal pipeline: destroyed → redact → purge ─────────────────────
function DisposalPipeline({ pipeline, due, disposing, setDisposing }) {
  return (
    <div className="mt-8">
      <PanelHead
        title="Disposal pipeline"
        sub="Destroy decides, redact removes content but keeps the fact, purge removes the record. In that order, only." />
      {pipeline.status === 'loading' ? <Loading /> :
       pipeline.status === 'failed' ? <LoadFailed reason={pipeline.reason} /> :
       pipeline.rows.length === 0 ? (
        <Empty kicker="disposal" line="Nothing is in the disposal pipeline."
               sub="Records appear here once destroyed under retention, for the
                    redaction review and — only after it — the purge." />
      ) : (
        <div className="panel">
          {pipeline.rows.map((d) => (
            <div className="waiting-row" key={d.agreement_id} style={{ alignItems: 'flex-start' }}>
              <div className="min-w-0">
                <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  {d.agreement_id}
                  <span className="caption">
                    {d.destroyed_on ? ` · destroyed ${d.destroyed_on}` : ''}
                    {d.redacted_on ? ` · redacted ${d.redacted_on} by ${d.redacted_by}` : ''}
                    {d.purged_on ? ` · purged ${d.purged_on}` : ''}
                  </span>
                </div>
                {d.external_bytes_pending && (
                  <div className="caption mt-0.5" data-testid="external-bytes-admin">
                    <strong>Bytes may survive outside.</strong> Redaction cleared this
                    system's pointer; it does not reach into an external store.
                  </div>
                )}
                {disposing?.id === d.agreement_id && disposing?.verb === 'redact' && (
                  <IrreversibleConfirm
                    verb="redact" agreementId={d.agreement_id}
                    description={`Redacting ${d.agreement_id} clears the document bytes and
                      the storage pointer. The filename, size, hash, dates and every audit
                      row stay — the fact survives the content.`}
                    action={() => API.redactAgreement({ agreement_id: d.agreement_id })}
                    onDone={(did) => { setDisposing(null); if (did) pipeline.reload(); }} />
                )}
                {disposing?.id === d.agreement_id && disposing?.verb === 'purge' && (
                  <IrreversibleConfirm
                    verb="purge" agreementId={d.agreement_id}
                    description={`Purging ${d.agreement_id} deletes the executed agreement,
                      its documents, certificate and signatories. The audit chain survives
                      it — evidence of correct disposal outlives the thing disposed of.
                      Yours alone; this one cannot be delegated.`}
                    action={() => API.purgeAgreement({ agreement_id: d.agreement_id })}
                    onDone={(did) => { setDisposing(null); if (did) pipeline.reload(); }} />
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`chip ${d.state === 'live' ? 'chip-ok'
                  : d.state === 'purged' ? 'chip-err' : 'chip-pending'}`}>
                  {d.state}
                </span>
                {d.state === 'destroyed' && (
                  <button className="btn btn-sm" data-testid={`redact-${d.agreement_id}`}
                          onClick={() => setDisposing(
                            disposing?.id === d.agreement_id && disposing?.verb === 'redact'
                              ? null : { id: d.agreement_id, verb: 'redact' })}>
                    redact…
                  </button>
                )}
                {d.state === 'redacted' && (
                  <button className="btn btn-sm" data-testid={`purge-${d.agreement_id}`}
                          onClick={() => setDisposing(
                            disposing?.id === d.agreement_id && disposing?.verb === 'purge'
                              ? null : { id: d.agreement_id, verb: 'purge' })}>
                    purge…
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Redaction delegates (U12): one person, one authority, revocable ───────
function DelegatesDesk() {
  const pane = usePane(() => API.recordsDelegates());
  const people = usePane(() => API.people());
  const [person, setPerson] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const live = pane.rows.filter((d) => !d.revoked_at);

  return (
    <div className="mt-8">
      <PanelHead
        title="Redaction delegates"
        sub="You may delegate the redact act — named, reasoned, revocable, on the record. Never the purge." />
      {live.length === 0 ? (
        <div className="caption">No delegation is live. Redaction is yours alone until one is.</div>
      ) : (
        <div className="panel">
          {live.map((d) => (
            <div className="waiting-row" key={d.delegate_id}>
              <div className="min-w-0">
                <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  {d.person}
                  <span className="caption"> · granted {String(d.granted_at).slice(0, 10)} · {d.reason}</span>
                </div>
              </div>
              <button className="btn btn-sm" disabled={busy}
                      data-testid={`revoke-delegate-${d.person}`}
                      onClick={async () => {
                        setBusy(true); setError(null);
                        const r = await API.revokeRecordsDelegate({ person: d.person });
                        setBusy(false);
                        if (!r.ok) { setError(r.reason); return; }
                        pane.reload();
                      }}>
                revoke
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-3 items-end">
        <div style={{ width: 240 }}>
          <label className="section-label">Person</label>
          <select className="mt-1.5 w-full font-mono" value={person}
                  onChange={(e) => setPerson(e.target.value)}>
            <option value="">choose a person</option>
            {(people.rows ?? []).map((p) => (
              <option key={p.person} value={p.person}>{p.person}</option>
            ))}
          </select>
        </div>
        <div className="grow">
          <label className="section-label">Why</label>
          <input className="mt-1.5 w-full" value={reason}
                 placeholder="a reason of substance — it is reviewed later"
                 onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy || !person || reason.trim().length < 5}
                data-testid="grant-delegate"
                onClick={async () => {
                  setBusy(true); setError(null);
                  const r = await API.grantRecordsDelegate({
                    person, reason: reason.trim(),
                  });
                  setBusy(false);
                  if (!r.ok) { setError(r.reason); return; }
                  setPerson(''); setReason(''); pane.reload();
                }}>
          ✓ delegate redaction
        </button>
      </div>
      {error && (
        <div className="panel p-3 mt-3">
          <div className="section-label">refused</div>
          <div className="caption mt-1">{error}</div>
        </div>
      )}
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
