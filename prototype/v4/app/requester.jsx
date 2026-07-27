// The Requester's workspace (WP-U12).
//
// My deals: this person's own engagements, and nothing of anyone else's.
//
// THREE RULES:
//
//   1. THE PIPELINE RAIL IS PER DEAL. v3 drew it as one global state, so two
//      deals at two stages shared a rail and the screen could only be telling
//      the truth about one of them.
//
//   2. REQUEST IS THE ONLY PATH PAST A BLOCKING FINDING. There is no
//      acknowledge, no override button, no "proceed anyway". The v3 button is
//      retired by ADR-0008 and this is the screen where undoing that would be
//      most tempting — "just for the demo flow" is exactly how it would come
//      back.
//
//   3. WHAT A REQUEST DOES NOT PROMISE IS SAID PLAINLY. Asking is not being
//      allowed. The gate stays shut while a request is socialising and while
//      its window runs, and the screen must not imply otherwise for a moment.

const { useState } = React;

// ── Asking for an override ───────────────────────────────────────────────
function RequestOverride({ deal, runId, onDone, onError, onCancel }) {
  const [justification, setJustification] = useState('');
  const [pressure, setPressure] = useState('');
  const [rows, setRows] = useState([{ finding_ref: '', severity: 'High', summary: '' }]);
  const [busy, setBusy] = useState(false);

  // WHY THE FINDINGS ARE TYPED RATHER THAN TICKED, and it is worth being plain
  // about: the validate stage does not exist yet, so there is no list of
  // findings on this deal to pick from. Rendering an invented list to make the
  // form feel finished is the thing this rebuild exists to stop.
  //
  // Typing them is not a placeholder either — the endpoint takes finding
  // references, a requester genuinely knows which findings blocked them, and
  // every one they name is recorded and decided individually. When the validate
  // stage lands, these get picked instead of typed and nothing else changes.
  const chosen = rows.filter((r) => r.finding_ref.trim() && r.summary.trim());

  // The floor the schema enforces, surfaced before the refusal rather than
  // after it. Twenty characters is not a quality bar — nothing here can judge
  // whether a reason is any good, and that is a content judgement belonging to
  // whoever reads it. It stops "n/a".
  const longEnough = justification.trim().length >= 20;

  return (
    <div className="panel p-4 mt-4">
      <PanelHead
        title="Ask for an override"
        sub="You are asking. Legal decides, after the people who should know have been told."
      />

      <div className="panel-2 p-3 mt-1">
        <div className="tag" style={{ color: 'var(--accent-2)' }}>what this does, and does not</div>
        <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)', lineHeight: 1.7 }}>
          This <strong>opens no gate</strong>. It records that you asked, tells
          the people who should know, and waits out a review window so that
          nobody discovers the override at signature. A Legal reviewer then
          decides <strong>each finding on its own</strong> — accepting one does
          not accept the others.
          <br /><br />
          Until a finding is approved, it still blocks.
        </div>
      </div>

      <div className="mt-4">
        <div className="section-label mb-2">Which findings</div>
        {rows.map((r, i) => (
          <div className="flex gap-2 mb-2 items-end" key={i}>
            <div style={{ width: 150 }}>
              <label className="caption">Reference</label>
              <input className="mt-1 w-full font-mono" style={{ padding: '4px 8px' }}
                     placeholder="data:F1" value={r.finding_ref}
                     data-testid={`finding-ref-${i}`}
                     onChange={(e) => setRows(rows.map((x, j) =>
                       j === i ? { ...x, finding_ref: e.target.value } : x))} />
            </div>
            <div className="flex-1">
              <label className="caption">What it says</label>
              <input className="mt-1 w-full" style={{ padding: '4px 8px' }}
                     placeholder="Governing law conflicts with the master"
                     value={r.summary}
                     onChange={(e) => setRows(rows.map((x, j) =>
                       j === i ? { ...x, summary: e.target.value } : x))} />
            </div>
            <select className="font-mono" style={{ padding: '5px 8px' }} value={r.severity}
                    onChange={(e) => setRows(rows.map((x, j) =>
                      j === i ? { ...x, severity: e.target.value } : x))}>
              <option value="High">High</option>
              <option value="Standard">Standard</option>
            </select>
            {rows.length > 1 && (
              <button className="btn btn-sm"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}>−</button>
            )}
          </div>
        ))}
        <button className="btn btn-sm"
                onClick={() => setRows([...rows, { finding_ref: '', severity: 'High', summary: '' }])}>
          + another finding
        </button>
        <div className="caption mt-2" style={{ lineHeight: 1.6 }}>
          Typed rather than ticked, because the validate stage that would list
          them is not built yet — and a list of invented findings would be a
          screen claiming something the system cannot do. Each one you name is
          decided on its own.
        </div>
      </div>

      <div className="mt-4">
        <label className="section-label">Why (required)</label>
        <textarea className="mt-1.5 w-full" rows={3}
                  data-testid="justification"
                  placeholder="What the business reason is, in your own words."
                  value={justification} onChange={(e) => setJustification(e.target.value)} />
        <div className="caption mt-1">
          {longEnough
            ? 'This goes on the permanent record and is what the reviewer reads.'
            : `A real reason, not "n/a" — ${Math.max(0, 20 - justification.trim().length)} more characters.`}
        </div>
      </div>

      <div className="mt-3">
        <label className="section-label">Commercial pressure being cited (optional)</label>
        <input className="mt-1.5 w-full" placeholder="The counterparty will not sign before quarter end"
               value={pressure} onChange={(e) => setPressure(e.target.value)} />
        {/* Kept separate from the justification on purpose: "they threatened to
            walk" and "we accept this risk because X" are different claims, and
            one collapsed into the other lets pressure stand in for reasoning. */}
        <div className="caption mt-1">
          Recorded separately from your reason, because pressure and reasoning
          are different things.
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button className="btn" onClick={onCancel}>cancel</button>
        <button
          className="btn btn-primary"
          disabled={busy || !longEnough || chosen.length === 0}
          data-testid="submit-override-request"
          onClick={async () => {
            setBusy(true); onError(null);
            const r = await API.requestOverride({
              run_id: runId,
              justification: justification.trim(),
              commercial_pressure: pressure.trim() || null,
              findings: chosen.map((f) => ({
                finding_ref: f.finding_ref.trim(),
                severity: f.severity,
                summary: f.summary.trim(),
              })),
            });
            if (!r.ok) { setBusy(false); onError(r.reason); return; }

            // Socialising is a SECOND act, and it is performed here rather than
            // folded into the first — but its refusal is surfaced rather than
            // swallowed. If nobody would be told, the request still exists and
            // the screen has to say that it has not been socialised, because a
            // request nobody was told about cannot be decided.
            const s = await API.socialiseOverride({
              request_id: r.rows[0].request_id,
            });
            setBusy(false);
            if (!s.ok) {
              onError(`Your request was recorded, but nobody could be told: ${s.reason}`);
              onDone();
              return;
            }
            onDone();
          }}
        >✓ ask for an override</button>
      </div>
    </div>
  );
}

// ── One deal, opened ─────────────────────────────────────────────────────
function OpenDeal({ deal, me, onBack }) {
  const overrides = usePane(() => API.overrides());
  const findings  = usePane(() => API.overrideFindings());
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const [runId, setRunId] = useState('');

  // Findings that would block this deal. There is no findings endpoint for a run
  // yet — the validate stage is a later package — so what is shown is what is
  // already on an override request. A pane that invented findings to make the
  // screen look complete is the thing this rebuild exists to stop.
  const mine = (overrides.rows ?? []).filter((r) => r.agreement_id === deal.agreement_id);
  const reload = () => { overrides.reload(); findings.reload(); };

  return (
    <div>
      <button className="btn btn-sm mb-4" onClick={onBack}>← my deals</button>

      <div className="panel p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="display-sm">{deal.counterparty}</div>
            <div className="font-mono caption mt-1">{deal.agreement_id}</div>
          </div>
          <span className="chip chip-std">{deal.status}</span>
        </div>
        {/* THIS deal's rail, and no other's. */}
        <div className="mt-4 pt-4 border-t hair"><PipelineRail deal={deal} /></div>
      </div>

      {error && (
        <div className="panel p-3 mt-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      {/* ── Override requests on this deal ──────────────────────────────── */}
      <div className="mt-6">
        <PanelHead
          title="Override requests"
          sub="Asking is recorded. Being allowed is a separate thing, and Legal's."
        />
        {overrides.status === 'failed' ? (
          <LoadFailed reason={overrides.reason} />
        ) : findings.status === 'failed' ? (
          /* Said plainly rather than rendered as a request with no findings
             under it. `(findings.rows ?? [])` turns a failed read into an
             empty list, and "we could not ask" must never wear the clothes of
             "there is nothing here". */
          <LoadFailed reason={findings.reason} />
        ) : mine.length === 0 ? (
          <Empty
            kicker="overrides"
            line="You have not asked for an override on this deal."
            sub="If a blocking finding stands in the way, asking is the only way past it — and asking is not the same as being allowed." />
        ) : mine.map((r) => {
          const fs = (findings.rows ?? []).filter((f) => f.request_id === r.request_id);
          return (
            <div className="panel p-4 mb-3" key={r.request_id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="section-label">Request {r.request_id}</div>
                  <div className="caption mt-1">asked {new Date(r.requested_at).toLocaleString()}</div>
                </div>
                {/* The status a requester actually needs: is it socialising, is
                    the window still running, has it been decided. Each is a
                    different answer to "can I proceed yet", and all three
                    answers are no until the last one. */}
                {r.state === 'requested'
                  ? <span className="chip chip-unknown">not socialised</span>
                  : r.state === 'socialised' && !r.window_closed
                    ? <span className="chip chip-pending">
                        window closes {new Date(r.window_closes).toLocaleString()}
                      </span>
                    : r.state === 'socialised'
                      ? <span className="chip chip-pending">waiting on Legal</span>
                      : r.state === 'approved'
                        ? <span className="chip chip-ok">decided</span>
                        : <span className="chip chip-err">{r.state}</span>}
              </div>

              <div className="caption mt-2">
                {r.notified_count
                  ? `${r.notified_count} ${r.notified_count === 1 ? 'person was' : 'people were'} told.`
                  : 'Nobody has been told yet, so nothing can be decided.'}
                {' '}{r.decided} of {r.findings} findings decided, {r.approved} approved.
              </div>

              <div className="mt-3">
                {fs.map((f) => (
                  <div className="flex items-center justify-between py-1.5" key={f.finding_ref}
                       style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="min-w-0">
                      <span className="font-mono" style={{ fontSize: 11, color: 'var(--mute-2)' }}>
                        {f.finding_ref}
                      </span>
                      <span className="text-[13px] ml-2">{f.summary}</span>
                    </div>
                    {f.decision === 'approved'
                      ? <span className="chip chip-ok">past the gate</span>
                      : f.decision === 'rejected'
                        ? <span className="chip chip-err" title={f.note}>still blocks</span>
                        : <span className="chip chip-pending">still blocks</span>}
                  </div>
                ))}
              </div>
              {fs.some((f) => f.decision === 'rejected') && (
                <div className="caption mt-2">
                  A rejected finding still blocks, and the reviewer's note says
                  why. Changing the contract is the way past it — asking again is
                  not.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {asking ? (
        <RequestOverride
          deal={deal}
          runId={runId}
          onCancel={() => setAsking(false)}
          onError={setError}
          onDone={() => { setAsking(false); setRunId(''); reload(); }}
        />
      ) : (
        <div className="mt-6">
          <div className="panel p-4">
            <PanelHead
              title="Blocked by a finding?"
              sub="Asking is the only way past one. There is no acknowledge button."
            />
            <div className="caption" style={{ lineHeight: 1.7 }}>
              The v3 prototype had a single <em>acknowledge · override</em>
              button that opened the gate on one click, with no record of who
              else should have known. It is retired, and nothing here replaces
              it: you <strong>ask</strong>, the people who should know are told,
              a window passes, and Legal decides each finding on its own.
            </div>
            <div className="flex gap-2 items-end mt-4">
              <div style={{ width: 200 }}>
                <label className="section-label">Which run</label>
                <input className="mt-1.5 w-full font-mono" placeholder="RUN-1"
                       data-testid="run-id"
                       value={runId} onChange={(e) => setRunId(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={!runId.trim()}
                      data-testid="ask-for-override"
                      onClick={() => setAsking(true)}>
                request an override…
              </button>
            </div>
            {/* The run is typed for the same reason the findings are: the forge
                that would produce one is not built, so there is no list to pick
                from and inventing one would be a screen claiming a capability. */}
            <div className="caption mt-2">
              Typed, because the forge that produces runs is not built yet.
            </div>
          </div>

          <div className="mt-6">
            <NotBuiltYet
              what="Intake, the manifest, the forge and the validate findings are not built."
              lands="a later package" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── My deals ─────────────────────────────────────────────────────────────
function MyDealsPane({ me }) {
  const deals = usePane(() => API.deals());
  const overrides = usePane(() => API.overrides());
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const [newDeal, setNewDeal] = useState({ id: '', counterparty: '' });

  if (deals.status === 'loading') return <Loading />;
  if (deals.status === 'failed') return <LoadFailed reason={deals.reason} />;

  if (open) {
    const deal = deals.rows.find((d) => d.agreement_id === open);
    if (!deal) return <LoadFailed reason="that deal is no longer in your list" />;
    return <OpenDeal deal={deal} me={me} onBack={() => setOpen(null)} />;
  }

  const waiting = (overrides.rows ?? []).filter((r) => r.state === 'socialised').length;

  return (
    <div>
      <TileStrip tiles={[
        { label: 'deals open', n: deals.rows.filter((d) => d.status !== 'executed').length },
        { label: 'awaiting Legal', n: overrides.status === 'loaded' ? waiting : null },
        { label: 'executed', n: deals.rows.filter((d) => d.status === 'executed').length },
      ]} />

      {error && (
        <div className="panel p-3 mt-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      <div className="mt-6">
        <PanelHead title="My deals" sub="Every engagement you opened, and nobody else's." />
        <WaitingList
          items={deals.rows.map((d) => ({
            key: d.agreement_id,
            title: d.counterparty,
            sub: d.agreement_id,
            at: null,
            chips: <span className="chip chip-std">{d.status}</span>,
          }))}
          onOpen={(it) => setOpen(it.key)}
          empty={<Empty
            kicker="my deals"
            line="You have no deals open."
            sub="Nothing is shown from anyone else's list — the database scopes this to you, so another buyer's engagements never reach this browser at all." />}
        />
      </div>

      <div className="panel p-4 mt-6">
        <PanelHead title="Open a deal" sub="It is yours, and it is opened in your name." />
        <div className="flex gap-2 items-end">
          <div style={{ width: 180 }}>
            <label className="section-label">Reference</label>
            <input className="mt-1.5 w-full font-mono" placeholder="AG-001"
                   value={newDeal.id}
                   onChange={(e) => setNewDeal({ ...newDeal, id: e.target.value })} />
          </div>
          <div style={{ width: 240 }}>
            <label className="section-label">Counterparty</label>
            <input className="mt-1.5 w-full" placeholder="Northwind"
                   value={newDeal.counterparty}
                   onChange={(e) => setNewDeal({ ...newDeal, counterparty: e.target.value })} />
          </div>
          <button className="btn btn-primary"
                  disabled={!newDeal.id.trim() || !newDeal.counterparty.trim()}
                  onClick={async () => {
                    setError(null);
                    const r = await API.openDeal({
                      agreement_id: newDeal.id.trim(),
                      counterparty: newDeal.counterparty.trim(),
                    });
                    if (!r.ok) { setError(r.reason); return; }
                    setNewDeal({ id: '', counterparty: '' });
                    deals.reload();
                  }}>✓ open</button>
        </div>
        {/* The requester is the session's person and cannot be anything else —
            said here because a form with no "requester" field looks like an
            omission otherwise. */}
        <div className="caption mt-3">
          The deal is opened in your name. There is no field for whose deal it is,
          because it is yours — opening one "on behalf of" somebody else would put
          the wrong name on every scoping decision that follows.
        </div>
      </div>
    </div>
  );
}

// ── My record ────────────────────────────────────────────────────────────
// The requester's own slice of the audit chain. Not a filtered view of
// everybody's — cw.audit_event's policy scopes a requester to rows where THEY
// are the actor, so this browser never receives anybody else's.
function MyRecordPane({ me }) {
  const pane = usePane(() => API.record());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;
  return (
    <div>
      <PanelHead
        title="My record"
        sub="Everything you have done, as the system recorded it."
      />
      <WaitingList
        items={pane.rows.map((e) => ({
          key: e.seq,
          title: e.event_type,
          sub: e.subject ?? '',
          at: e.ts,
          chips: <span className="chip chip-std">{e.actor_role ?? 'no role'}</span>,
        }))}
        empty={<Empty kicker="my record" line="You have not done anything yet."
                      sub="Every act you take is recorded here, permanently." />}
      />
      <div className="caption mt-3">
        This is only your own acts. The database scopes it that way — the rest of
        the record is not filtered out in this browser, it never arrives.
      </div>
    </div>
  );
}
