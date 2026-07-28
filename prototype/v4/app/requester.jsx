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
// THE REFERENCE A FINDING IS KNOWN BY, IN ONE PLACE ON THIS SIDE.
//
// It must be the same string backend/doorway/executions.py builds, because the
// gate at signature matches an approval against it. If the two ever disagree,
// an approval Legal genuinely gave stops covering the finding it was given for
// — and the failure lands at the signature, which is the worst possible moment
// and the one act that cannot be undone. Matching there is fail-closed on
// purpose, so a mismatch refuses rather than passing.
function findingRef(f) { return `${f.rule_id}@v${f.rule_version}`; }

function RequestOverride({ deal, runId, blocking, onDone, onError, onCancel }) {
  const [justification, setJustification] = useState('');
  const [pressure, setPressure] = useState('');
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);

  // TICKED, NOT TYPED — and that changed when the validate stage arrived.
  //
  // These were typed by hand against a placeholder, because there was no list
  // of findings to pick from and inventing one would have been a screen
  // claiming something the system could not do. There is a real list now: these
  // are the findings that actually blocked this run, from the run's own record.
  //
  // Typing them is now the dangerous option rather than the honest one. A
  // reference typed by hand is a reference that can be typed WRONG, and a
  // wrong one is not rejected at the time — it is accepted, decided by Legal,
  // and then fails to cover anything at signature.
  const chosen = (blocking ?? []).filter((f) => picked[findingRef(f)]);

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
        {(blocking ?? []).length === 0 ? (
          <div className="caption" style={{ lineHeight: 1.7 }}>
            Nothing on this run is blocking. There is nothing to ask about.
          </div>
        ) : (blocking ?? []).map((f, i) => {
          const ref = findingRef(f);
          return (
            <label className="flex gap-3 items-start py-2" key={ref}
                   style={{ borderTop: '1px solid var(--line)', cursor: 'pointer' }}>
              <input type="checkbox" className="mt-1" checked={!!picked[ref]}
                     data-testid={`finding-pick-${i}`}
                     onChange={(e) => setPicked({ ...picked, [ref]: e.target.checked })} />
              <div className="min-w-0">
                <span className="font-mono" style={{ fontSize: 11, color: 'var(--mute-2)' }}>
                  {ref}
                </span>
                <span className="text-[13px] ml-2">{f.title}</span>
                <div className="caption mt-0.5">{f.detail}</div>
              </div>
            </label>
          );
        })}
        <div className="caption mt-2" style={{ lineHeight: 1.6 }}>
          These are the findings that actually blocked this run, taken from its
          own record. Each one you tick is decided on its own — accepting one
          does not accept the others.
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
                finding_ref: findingRef(f),
                severity: f.severity,
                summary: f.title,
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

// ── Composing a manifest, and assembling the contract ────────────────────
//
// The manifest is the ONE thing that crosses from a language model into the
// deterministic core, and this pane is where a person composes one by hand.
// That is not a lesser path: the trust boundary accepts a composed manifest
// from anywhere and checks it identically, so what is typed here is checked by
// exactly the same rule as what a model would produce.
//
// PRE-FLIGHT, THEN ASSEMBLE, and they are two separate acts on purpose. The
// pre-flight says whether the categories are ones the library defines; it
// records nothing and produces no contract. Assembling records a run that
// cannot afterwards be edited or removed.
function AssembleContract({ deal, categories, onAssembled, onError }) {
  const [source, setSource] = useState('manual');
  const [risks, setRisks] = useState([{ category: '', severity: 'Standard', justification: '' }]);
  const [checked, setChecked] = useState(null);
  const [busy, setBusy] = useState(false);

  const ready = risks.filter((r) => r.category.trim());

  const body = () => ({
    agreement_id: deal.agreement_id,       // FROM THE OPEN DEAL, never typed.
    vendor: deal.counterparty,
    source,
    risks: ready.map((r) => ({
      category: r.category.trim(),
      severity: r.severity,
      justification: r.justification.trim(),
    })),
  });

  return (
    <div className="panel p-4 mt-6">
      <PanelHead
        title="Assemble a contract"
        sub="Check it first. Checking records nothing; assembling records a run that cannot be edited."
      />

      <div className="mt-3">
        <div className="section-label mb-2">Risks in scope</div>
        {risks.map((r, i) => (
          <div className="flex gap-2 mb-2 items-end" key={i}>
            <div style={{ width: 200 }}>
              <label className="caption">Category</label>
              <select className="mt-1 w-full" style={{ padding: '5px 8px' }}
                      data-testid={`risk-category-${i}`}
                      value={r.category}
                      onChange={(e) => setRisks(risks.map((x, j) =>
                        j === i ? { ...x, category: e.target.value } : x))}>
                <option value="">choose…</option>
                {/* THE LIBRARY'S OWN CATEGORIES, read from the library screen's
                    endpoint. Not a list written here: a category this screen
                    invented would be refused by the trust boundary, and the
                    person would be told the model hallucinated when in fact
                    this page did. */}
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="caption">Why it is in scope</label>
              <input className="mt-1 w-full" style={{ padding: '4px 8px' }}
                     placeholder="The counterparty processes EU personal data"
                     value={r.justification}
                     onChange={(e) => setRisks(risks.map((x, j) =>
                       j === i ? { ...x, justification: e.target.value } : x))} />
            </div>
            <select className="font-mono" style={{ padding: '5px 8px' }} value={r.severity}
                    onChange={(e) => setRisks(risks.map((x, j) =>
                      j === i ? { ...x, severity: e.target.value } : x))}>
              <option value="Standard">Standard</option>
              <option value="High">High</option>
            </select>
            {risks.length > 1 && (
              <button className="btn btn-sm"
                      onClick={() => setRisks(risks.filter((_, j) => j !== i))}>−</button>
            )}
          </div>
        ))}
        <button className="btn btn-sm"
                onClick={() => setRisks([...risks, { category: '', severity: 'Standard', justification: '' }])}>
          + another risk
        </button>
      </div>

      <div className="flex gap-2 items-end mt-4">
        <div style={{ width: 160 }}>
          <label className="section-label">Where it came from</label>
          <select className="mt-1.5 w-full font-mono" style={{ padding: '5px 8px' }}
                  data-testid="manifest-source"
                  value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="manual">manual</option>
            <option value="llm">llm</option>
            <option value="fallback">fallback</option>
          </select>
        </div>
        <button className="btn" disabled={busy || ready.length === 0}
                data-testid="check-manifest"
                onClick={async () => {
                  setBusy(true); onError(null); setChecked(null);
                  const r = await API.checkManifest(body());
                  setBusy(false);
                  setChecked(r);
                  if (!r.ok) onError(null);   // shown in place, below
                }}>
          check it
        </button>
        {/* ASSEMBLING IS ONLY REACHABLE ONCE THE CHECK HAS PASSED. Not because
            the endpoint would let a bad manifest through — it runs the same
            check itself — but because a run is permanent, and finding out that
            a category was invented AFTER recording one is a worse way to learn
            it than before. */}
        <button className="btn btn-primary" disabled={busy || !checked?.ok}
                data-testid="assemble"
                onClick={async () => {
                  setBusy(true); onError(null);
                  const r = await API.recordRun(body());
                  setBusy(false);
                  if (!r.ok) { onError(r.reason); return; }
                  setChecked(null);
                  onAssembled();
                }}>
          ✓ assemble the contract
        </button>
      </div>

      {checked && !checked.ok && (
        <div className="panel-2 p-3 mt-3" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          {/* The engine's own sentence, unchanged. It says which category it
              does not know and why that matters; a friendlier sentence written
              here would throw away the only part anybody can act on. */}
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>
            {checked.reason}
          </div>
        </div>
      )}

      {checked?.ok && (
        <div className="panel-2 p-3 mt-3">
          <div className="tag" style={{ color: 'var(--accent-2)' }}>checked, not recorded</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)', lineHeight: 1.7 }}>
            Every category is one the library defines. Nothing has been recorded
            yet.
            {(checked.body?.coerced ?? []).length > 0 && (
              <>
                <br /><br />
                <strong>Severities that were rewritten:</strong>{' '}
                {checked.body.coerced.map((c) => `${c.category} (you said ${c.claimed})`).join(', ')}.
                {' '}An accepted manifest is not necessarily an untouched one.
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── What a run produced ──────────────────────────────────────────────────
function RunResult({ run, decisions, findings, onError }) {
  const [busy, setBusy] = useState(false);
  const mine = decisions.filter((d) => d.run_id === run.run_id);
  const flagged = findings.filter((f) => f.run_id === run.run_id);

  return (
    <div className="panel p-4 mt-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="section-label">Assembled {new Date(run.created_at).toLocaleString()}</div>
          <div className="font-mono caption mt-1">{run.run_id}</div>
        </div>
        {run.gate_open
          ? <span className="chip chip-ok">nothing blocking</span>
          : <span className="chip chip-err">blocked</span>}
      </div>

      <div className="caption mt-2">
        {/* ZERO READS AS ZERO. A contract checked against no rules is not a
            clean contract, it is an unchecked one, and the difference has to
            be visible rather than implied by an empty findings list. */}
        {run.findings} {run.findings === 1 ? 'finding' : 'findings'} from{' '}
        {run.decisions} {run.decisions === 1 ? 'clause' : 'clauses'}.
        {run.unresolved > 0 && ` ${run.unresolved} risk${run.unresolved === 1 ? '' : 's'} the library covers with nothing.`}
      </div>

      <div className="mt-3">
        {mine.map((d) => (
          <div className="py-1.5" key={d.seq} style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[13px]">{d.category}</span>
                {d.clause_id
                  ? <span className="font-mono ml-2" style={{ fontSize: 11, color: 'var(--mute-2)' }}>
                      {d.clause_id}@v{d.version}
                    </span>
                  : <span className="chip chip-unknown ml-2">no clause</span>}
              </div>
              <span className="chip chip-std">{d.severity}</span>
            </div>
            {/* The engine's own reason, rendered and never rewritten. "No
                clause available in Ledger" is a statement about the LIBRARY,
                and softening it here would hide a gap that belongs to somebody. */}
            <div className="caption mt-0.5">{d.reason}</div>
            {d.warning && <div className="caption mt-0.5" style={{ color: 'var(--warn)' }}>{d.warning}</div>}
          </div>
        ))}
      </div>

      {flagged.length > 0 && (
        <div className="mt-3 pt-3 border-t hair">
          <div className="section-label mb-1">What the rules found</div>
          {flagged.map((f) => (
            <div className="py-1.5" key={f.seq} style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex items-baseline gap-2">
                <span className={f.severity === 'High' ? 'chip chip-err' : 'chip chip-pending'}>
                  {f.severity}
                </span>
                <span className="text-[13px]">{f.title}</span>
                <span className="font-mono" style={{ fontSize: 11, color: 'var(--mute-2)' }}>
                  {f.rule_id}@v{f.rule_version}
                </span>
              </div>
              <div className="caption mt-0.5">{f.detail}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <button className="btn btn-sm" disabled={busy}
                data-testid="download-contract"
                onClick={async () => {
                  setBusy(true); onError(null);
                  const r = await API.contract(run.run_id);
                  setBusy(false);
                  // A REFUSED DOWNLOAD IS A SENTENCE, NOT A BROKEN FILE. The
                  // endpoint refuses if the run no longer rebuilds, and saving
                  // whatever came back would put an unexplainable document on
                  // somebody's desktop.
                  if (!r.ok) { onError(r.reason); return; }

                  // The DOM half of a download lives HERE and in no other
                  // screen — see api.jsx. ADR-0008 gave the viewer no export
                  // path, and that survives because saving a file is a thing
                  // one screen does rather than a thing the transport does.
                  const url = URL.createObjectURL(r.blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = r.filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}>
          download the contract
        </button>
        <div className="caption mt-1.5">
          Rebuilt from this run every time, and refused if it no longer
          reproduces. Nothing is stored.
        </div>
      </div>
    </div>
  );
}

// ── One deal, opened ─────────────────────────────────────────────────────
function OpenDeal({ deal, me, onBack }) {
  const overrides = usePane(() => API.overrides());
  const findings  = usePane(() => API.overrideFindings());
  const runs      = usePane(() => API.runs());
  const decisions = usePane(() => API.runDecisions());
  const runFindings = usePane(() => API.runFindings());
  const library   = usePane(() => API.library());
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const [runId, setRunId] = useState('');

  const mine = (overrides.rows ?? []).filter((r) => r.agreement_id === deal.agreement_id);

  // THIS DEAL'S RUNS, filtered from what the rule already returned. The reads
  // take no parameter — the scoping is "these runs, this person" and it comes
  // from the connection, not from anything the browser can name.
  const dealRuns = (runs.rows ?? [])
    .filter((r) => r.agreement_id === deal.agreement_id);
  const chosen = dealRuns.find((r) => r.run_id === runId) || dealRuns[0] || null;

  // What actually blocked the chosen run, from the run's own record. High is
  // the severity that closes a gate; a Standard finding is worth reading and
  // does not stop anything, so offering to override one would be theatre.
  const blocking = (runFindings.rows ?? [])
    .filter((f) => chosen && f.run_id === chosen.run_id && f.severity === 'High');

  // The LABEL, which is the string a manifest carries and the trust boundary
  // checks against. The key is for the database's own foreign keys; sending one
  // here would be refused as an invented category, and the person would be told
  // the model hallucinated when in fact this page did.
  const categories = [...new Set((library.rows ?? []).map((c) => c.category_label))]
    .filter(Boolean).sort();

  const reload = () => {
    overrides.reload(); findings.reload();
    runs.reload(); decisions.reload(); runFindings.reload();
  };

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

      {/* ── The contract itself ─────────────────────────────────────────── */}
      <div className="mt-6">
        <PanelHead
          title="The contract"
          sub="Assembled from approved wording only. Nothing here is written by the system."
        />
        {runs.status === 'failed' ? (
          <LoadFailed reason={runs.reason} />
        ) : dealRuns.length === 0 ? (
          <Empty
            kicker="not assembled"
            line="No contract has been assembled for this deal."
            sub="Say which risks are in scope and the system selects approved wording for each." />
        ) : (
          <>
            {dealRuns.length > 1 && (
              <div className="panel p-3 mb-1">
                <label className="section-label">Which assembly</label>
                <select className="mt-1.5 w-full font-mono" style={{ padding: '5px 8px' }}
                        data-testid="run-choice"
                        value={chosen ? chosen.run_id : ''}
                        onChange={(e) => setRunId(e.target.value)}>
                  {dealRuns.map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      {new Date(r.created_at).toLocaleString()} — {r.run_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {chosen && (
              <RunResult
                run={chosen}
                decisions={decisions.rows ?? []}
                findings={runFindings.rows ?? []}
                onError={setError} />
            )}
          </>
        )}
      </div>

      <AssembleContract
        deal={deal}
        categories={categories}
        onError={setError}
        onAssembled={() => { setRunId(''); reload(); }} />

      {asking ? (
        <RequestOverride
          deal={deal}
          runId={chosen ? chosen.run_id : ''}
          blocking={blocking}
          onCancel={() => setAsking(false)}
          onError={setError}
          onDone={() => { setAsking(false); setAsking(false); reload(); }}
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
              {/* NEITHER THE RUN NOR THE FINDINGS ARE TYPED ANY MORE. Both are
                  taken from the assembly above — the run this person is looking
                  at, and the findings that actually blocked it. A reference
                  typed by hand is one that can be typed wrong, and a wrong one
                  is not caught when it is written: it is decided by Legal and
                  then covers nothing at signature. */}
              <button className="btn btn-primary"
                      disabled={!chosen || blocking.length === 0}
                      data-testid="ask-for-override"
                      onClick={() => setAsking(true)}>
                request an override…
              </button>
            </div>
            <div className="caption mt-2">
              {!chosen
                ? 'Assemble the contract first — an override is asked about a specific finding on a specific assembly.'
                : blocking.length === 0
                  ? 'Nothing on this assembly is blocking, so there is nothing to ask about.'
                  : `${blocking.length} ${blocking.length === 1 ? 'finding blocks' : 'findings block'} this assembly.`}
            </div>
          </div>

          <div className="mt-6">
            {/* WHAT IS STILL GENUINELY MISSING, and only that. The manifest,
                the assembly and the findings are built; the intake interview
                that would compose a manifest by asking questions is not, which
                is why the risks above are chosen by hand. */}
            <NotBuiltYet
              what="The intake interview — the questions that would compose a manifest for you — is not built. Risks are chosen by hand above."
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
