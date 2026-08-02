// The Legal admin's library, ladders, governance and retention — WP-U13, whole.
//
// THE ACTING HALVES ARE BUILT (D-5, 2026-08-02). Every act defers to the
// database's authority and renders its refusals verbatim; no permission is
// decided in this file.
//
// THE ONE INVARIANT EVERY ACT HERE OBEYS: there is no in-place edit of
// approved wording, anywhere. Retiring withdraws; superseding MINTS A NEW
// VERSION with its history intact (cw.supersede_clause); replacing a ladder
// retires the old one and publishes a successor, because past concessions are
// recorded as "we went to rung 2" and reordering in place would rewrite what
// they meant. An edit affordance would be the mutation-surface invariant
// broken in the UI rather than in the schema.
//
// FRICTION BELONGS WHERE THE IRREVERSIBILITY IS (the reviewer desk's rule).
// Retiring and superseding confirm with a preview of exactly what will be
// written. Filters and drawers do not.
//
// THE COVERAGE-GAP RULE, from the common anti-pattern. A gap is surfaced, never
// framed as a system failure. The system's job ends at making the gap visible
// and giving the responsible person a place to act; the gap itself belongs to
// the people who own the library. The copy below is written to that line and
// should stay on it.

const { useState } = React;

// The database's sentence, rendered verbatim. Every act form uses this rather
// than rewording a refusal into something friendlier and less true.
function ActError({ error }) {
  if (!error) return null;
  return (
    <div className="panel p-3 mt-3" style={{ borderColor: 'var(--err, #b91c1c)' }}
         data-testid="act-error">
      <div className="section-label">refused</div>
      <div className="caption mt-1">{error}</div>
    </div>
  );
}

// ── Retiring wording: withdrawal, with a reason, confirmed ────────────────
function RetireForm({ clause, onDone }) {
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="panel p-3 mt-2" data-testid="retire-form">
      <div className="section-label">retire {clause.clause_id}@v{clause.version}</div>
      {clause.is_a_floor && (
        // WARNED, NOT GATED (the house rule). Retiring a floor turns an intact
        // ladder into floor_unusable; the person acting is told before the act,
        // and the ladder board will say so after it.
        <div className="caption mt-1" data-testid="floor-warning">
          <strong>This version is holding up a ladder as its floor.</strong>{' '}
          Retiring it leaves that ladder unusable at its stopping point until a
          replacement is published.
        </div>
      )}
      {!confirming ? (
        <div className="mt-2">
          <label className="section-label">Why it is withdrawn</label>
          <input className="mt-1.5 w-full" value={reason} placeholder="the reason on the record"
                 onChange={(e) => setReason(e.target.value)} data-testid="retire-reason" />
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={() => onDone(false)}>cancel</button>
            <button className="btn" disabled={!reason.trim()}
                    data-testid="review-retire"
                    onClick={() => setConfirming(true)}>
              review what will be withdrawn…
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="caption" style={{ whiteSpace: 'pre-wrap' }}>
            {clause.clause_id}@v{clause.version} — “{clause.title}” — stops being
            selectable, permanently. Its wording and history stay readable, and
            every contract already carrying it is untouched. Reason: {reason.trim()}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={() => setConfirming(false)}>← back</button>
            <button className="btn btn-primary" disabled={busy}
                    data-testid="confirm-retire"
                    onClick={async () => {
                      setBusy(true); setError(null);
                      const r = await API.retireClause({
                        clause_id: clause.clause_id, version: clause.version,
                        reason: reason.trim(),
                      });
                      setBusy(false);
                      if (!r.ok) { setError(r.reason); setConfirming(false); return; }
                      onDone(true);
                    }}>
              {busy ? 'retiring…' : '✓ retire this wording'}
            </button>
          </div>
        </div>
      )}
      <ActError error={error} />
    </div>
  );
}

// ── Superseding: a NEW version is minted; nothing is rewritten ────────────
function SupersedeForm({ clause, onDone }) {
  const [title, setTitle] = useState(clause.title || '');
  const [body, setBody] = useState('');
  const [rationale, setRationale] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [disposition, setDisposition] = useState('run_off');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const complete = title.trim() && body.trim() && rationale.trim() && reason.trim();

  return (
    <div className="panel p-3 mt-2" data-testid="supersede-form">
      <div className="section-label">supersede {clause.clause_id}@v{clause.version}</div>
      {!confirming ? (
        <div className="mt-2">
          <label className="section-label">Successor title</label>
          <input className="mt-1.5 w-full" value={title}
                 onChange={(e) => setTitle(e.target.value)} data-testid="supersede-title" />
          <label className="section-label mt-3">The successor wording</label>
          <textarea className="mt-1.5 w-full font-mono" rows={5} value={body}
                    placeholder="the wording that replaces it, in full"
                    onChange={(e) => setBody(e.target.value)} data-testid="supersede-body" />
          <label className="section-label mt-3">Why this wording</label>
          <input className="mt-1.5 w-full" value={rationale}
                 placeholder="shown to reviewers with the version"
                 onChange={(e) => setRationale(e.target.value)} />
          <label className="section-label mt-3">Why the old one is replaced</label>
          <input className="mt-1.5 w-full" value={reason}
                 placeholder="the supersession reason on the record"
                 onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-3 mt-3 items-end">
            <div>
              <label className="section-label">Expires (optional)</label>
              <input className="mt-1.5 font-mono" type="date" value={expires}
                     onChange={(e) => setExpires(e.target.value)} />
            </div>
            <div>
              <label className="section-label">The predecessor</label>
              <select className="mt-1.5 font-mono" value={disposition}
                      onChange={(e) => setDisposition(e.target.value)}>
                <option value="run_off">runs off — existing deals keep it</option>
                <option value="retire_now">retire now</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={() => onDone(false)}>cancel</button>
            <button className="btn" disabled={!complete}
                    data-testid="review-supersede"
                    onClick={() => setConfirming(true)}>
              review what will be minted…
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="caption" style={{ whiteSpace: 'pre-wrap' }}>
            A new version of {clause.clause_id} will be minted — “{title.trim()}”
            — and v{clause.version} recorded as superseded by it. Nothing already
            signed or in flight is rewritten; deals carrying the old wording are
            flagged on the drift report instead.
          </div>
          <div className="caption mt-2 font-mono" style={{ whiteSpace: 'pre-wrap' }}>
            {body.trim()}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={() => setConfirming(false)}>← back</button>
            <button className="btn btn-primary" disabled={busy}
                    data-testid="confirm-supersede"
                    onClick={async () => {
                      setBusy(true); setError(null);
                      const r = await API.supersedeClause({
                        clause_id: clause.clause_id, version: clause.version,
                        title: title.trim(), body: body.trim(),
                        rationale: rationale.trim(), reason: reason.trim(),
                        expires_on: expires || null, disposition,
                      });
                      setBusy(false);
                      if (!r.ok) { setError(r.reason); setConfirming(false); return; }
                      onDone(true);
                    }}>
              {busy ? 'minting…' : '✓ mint the successor'}
            </button>
          </div>
        </div>
      )}
      <ActError error={error} />
    </div>
  );
}

// ── The library ───────────────────────────────────────────────────────────
function LibraryPane() {
  const pane = usePane(() => API.library());
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [open, setOpen] = useState(null);
  const [acting, setActing] = useState(null); // { key, kind: 'retire'|'supersede' }

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  if (pane.rows.length === 0) {
    return (
      <div>
        <PanelHead title="The library" sub="Every approved position, and its history." />
        <Empty
          kicker="the library"
          line="No clause has been approved yet."
          sub="Wording enters through the review queue. An empty library is a
               true state of this system, not a failure to load." />
      </div>
    );
  }

  const rows = pane.rows.filter((c) =>
    (!state || c.state === state)
    && (!q || (c.clause_id ?? '').includes(q)
           || (c.title ?? '').toLowerCase().includes(q.toLowerCase())
           || (c.category_label ?? '').toLowerCase().includes(q.toLowerCase())));

  // The categories with nothing selectable behind them, derived from the rows
  // rather than fetched again — cw.library_entry carries the flag per row
  // precisely so the screen does not have to ask twice.
  const uncovered = [...new Map(
    pane.rows.filter((c) => c.category_uncovered)
      .map((c) => [`${c.category_key}/${c.severity}`,
                   { label: c.category_label, severity: c.severity }])).values()];

  const states = [...new Set(pane.rows.map((c) => c.state))].sort();

  return (
    <div>
      <PanelHead title="The library" sub="Every approved position, and its history." />

      {uncovered.length > 0 && (
        // SURFACED, NOT BLAMED. The system's responsibility ends at making this
        // visible and naming who can act; the gap itself belongs to the library's
        // owners. Note what this does not say: not "error", not "misconfigured",
        // not "the system cannot resolve". It says what is missing and whose it
        // is to fill.
        <div className="panel p-3 mb-4" data-testid="coverage-gap">
          <div className="section-label">Nothing approved to fall back on</div>
          <div className="font-serif italic mt-1" style={{ fontSize: 15, color: 'var(--mute)' }}>
            {uncovered.length === 1 ? 'One category has' : `${uncovered.length} categories have`}
            {' '}no selectable wording at a severity the engine may be asked for.
          </div>
          <div className="caption mt-2">
            {uncovered.map((u) => `${u.label} · ${u.severity}`).join('  ·  ')}
          </div>
          <div className="caption mt-2">
            A run that reaches one of these has nothing to offer and will say so.
            <strong> Closing it is Legal's to do</strong> — the system's part is to
            show it here rather than discover it mid-negotiation.
          </div>
        </div>
      )}

      <TileStrip tiles={[
        { label: 'versions', n: pane.rows.length },
        { label: 'selectable now', n: pane.rows.filter((c) => c.selectable).length },
        { label: 'expiring within 90 days', n: pane.rows.filter((c) => c.expires_soon).length },
        { label: 'no approval or expiry date', n: pane.rows.filter((c) => c.provenance_gap).length },
      ]} />

      <div className="flex gap-2 mb-3 mt-4">
        <input className="font-mono" style={{ width: 240, padding: '5px 9px' }}
               placeholder="clause, title or category" value={q}
               onChange={(e) => setQ(e.target.value)} data-testid="library-search" />
        <select className="font-mono" style={{ padding: '5px 9px' }} value={state}
                onChange={(e) => setState(e.target.value)} data-testid="library-state">
          <option value="">every state</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="caption self-center">{rows.length} of {pane.rows.length}</div>
      </div>

      {rows.length === 0 ? (
        <Empty kicker="the library" line="No version matches that."
               sub="Clear the filters to see the whole library." />
      ) : (
        <div className="panel">
          {rows.map((c) => {
            const key = `${c.clause_id}@${c.version}`;
            const isOpen = open === key;
            return (
              <div className="waiting-row" key={key} style={{ alignItems: 'flex-start' }}>
                <div className="min-w-0">
                  <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                    {c.title}
                    <span className="caption"> · {c.clause_id}@v{c.version} · {c.category_label} · {c.severity}</span>
                  </div>
                  <div className="caption mt-0.5">
                    {c.expires_on
                      ? `expires ${c.expires_on}${c.days_to_expiry !== null && c.days_to_expiry !== undefined
                          ? ` (${c.days_to_expiry} days)` : ''}`
                      : 'no expiry date recorded'}
                    {c.approved_on ? ` · approved ${c.approved_on}` : ' · no approval date recorded'}
                    {c.reviewer ? ` by ${c.reviewer}` : ''}
                  </div>
                  {/* LOAD-BEARING, AND THE REASON THIS COLUMN EXISTS. The question
                      to answer BEFORE retiring something is "is this the floor of
                      a ladder?" — retiring a floor turns an intact ladder into
                      floor_unusable, and finding out afterwards means resolution
                      is already refusing to descend it. */}
                  {c.on_ladders > 0 && (
                    <div className="caption mt-0.5" data-testid="on-ladders">
                      {c.is_a_floor
                        ? 'holding up a ladder as its floor'
                        : `on ${c.on_ladders} ladder${c.on_ladders === 1 ? '' : 's'}`}
                    </div>
                  )}
                  {isOpen && (
                    <div className="caption mt-2" style={{ whiteSpace: 'pre-wrap' }}
                         data-testid="rationale-drawer">
                      <div className="section-label">why this wording</div>
                      <div className="mt-1">{c.rationale || 'No rationale was recorded with this version.'}</div>
                      <div className="section-label mt-3">the wording</div>
                      <div className="mt-1">{c.body}</div>
                      {c.state === 'superseded' && (
                        <div className="mt-2">
                          superseded by v{c.successor_version}
                          {c.superseded_reason ? ` — ${c.superseded_reason}` : ''}
                          {c.predecessor_disposition ? ` (${c.predecessor_disposition})` : ''}
                        </div>
                      )}
                      {c.state === 'active' && (
                        <div className="flex gap-2 mt-3">
                          <button className="btn btn-sm" data-testid="open-retire"
                                  onClick={() => setActing(
                                    acting?.key === key && acting?.kind === 'retire'
                                      ? null : { key, kind: 'retire' })}>
                            retire…
                          </button>
                          <button className="btn btn-sm" data-testid="open-supersede"
                                  onClick={() => setActing(
                                    acting?.key === key && acting?.kind === 'supersede'
                                      ? null : { key, kind: 'supersede' })}>
                            supersede…
                          </button>
                        </div>
                      )}
                      {acting?.key === key && acting.kind === 'retire' && (
                        <RetireForm clause={c}
                          onDone={(did) => { setActing(null); if (did) pane.reload(); }} />
                      )}
                      {acting?.key === key && acting.kind === 'supersede' && (
                        <SupersedeForm clause={c}
                          onDone={(did) => { setActing(null); if (did) pane.reload(); }} />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {c.provenance_gap && <span className="chip chip-unknown">undated</span>}
                  {c.expires_soon && <span className="chip chip-pending">expiring</span>}
                  <span className={`chip ${c.state === 'active' ? 'chip-ok'
                    : c.state === 'retired' || c.state === 'expired' ? 'chip-err' : 'chip-std'}`}>
                    {c.state}
                  </span>
                  <button className="btn btn-sm" onClick={() => setOpen(isOpen ? null : key)}
                          data-testid="rationale-toggle">
                    {isOpen ? 'close' : 'why'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="caption mt-3">
        Every change here mints a <strong>new version</strong> with its history
        intact, or withdraws one. There is deliberately no in-place edit:
        rewriting approved wording under the decisions already taken on it is the
        one thing this library exists to prevent. New wording enters through the
        review queue; activation is the minting itself.
      </p>
    </div>
  );
}

// ── Moving the floor: a policy call, confirmed, audited ───────────────────
function FloorForm({ ladder, onDone }) {
  const [rung, setRung] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="panel p-3 mt-2" data-testid="floor-form">
      <div className="section-label">move the floor</div>
      <div className="caption mt-1">
        The floor is the last position we will accept — below it, escalation is
        mandatory. Moving it changes how far down every future negotiation in
        this category may go, and the move lands on the audit chain.
      </div>
      <div className="flex gap-2 mt-2 items-end">
        <select className="font-mono" value={rung}
                onChange={(e) => setRung(e.target.value)} data-testid="floor-rung">
          <option value="">choose the rung</option>
          {ladder.steps.map((s) => (
            <option key={s.rung} value={s.rung}>
              rung {s.rung} · {s.clause_id}@v{s.version}{s.is_floor ? ' (the floor today)' : ''}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => onDone(false)}>cancel</button>
        <button className="btn btn-primary" disabled={busy || rung === ''}
                data-testid="confirm-floor"
                onClick={async () => {
                  setBusy(true); setError(null);
                  const r = await API.moveFloor({
                    ladder_id: ladder.ladder_id, rung: Number(rung),
                  });
                  setBusy(false);
                  if (!r.ok) { setError(r.reason); return; }
                  onDone(true);
                }}>
          {busy ? 'moving…' : '✓ set the floor there'}
        </button>
      </div>
      <ActError error={error} />
    </div>
  );
}

// ── Replacing a ladder: reorder = retire + publish, in one recorded act ───
// Rung order is immutable in place because past concessions are recorded as
// "we went to rung 2" — so the reordering act is publishing a successor
// ladder. The old one retires and stays readable forever.
function ReplaceLadderForm({ ladder, onDone }) {
  const [draft, setDraft] = useState(ladder.steps.map((s) => ({ ...s })));
  const [floorAt, setFloorAt] = useState(
    Math.max(0, ladder.steps.findIndex((s) => s.is_floor)));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    const next = draft.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
    if (floorAt === i) setFloorAt(j); else if (floorAt === j) setFloorAt(i);
  };

  return (
    <div className="panel p-3 mt-2" data-testid="replace-form">
      <div className="section-label">replace this ladder</div>
      <div className="caption mt-1">
        The order below becomes a <strong>new</strong> ladder; this one retires
        and stays readable, so every past concession keeps meaning what it
        meant. Both halves are one recorded act.
      </div>
      {!confirming ? (
        <div className="mt-2">
          {draft.map((s, i) => (
            <div className="flex gap-2 items-center mt-1.5" key={`${s.clause_id}@${s.version}`}
                 data-testid="draft-rung">
              <span className="font-mono caption" style={{ width: 28 }}>{i}</span>
              <span className="text-[13px] min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                {s.rung_title ?? s.clause_id}
                <span className="caption"> · {s.clause_id}@v{s.version}</span>
              </span>
              <span className="flex gap-1 shrink-0 ml-auto items-center">
                <label className="caption">
                  <input type="radio" name={`floor-${ladder.ladder_id}`}
                         checked={floorAt === i} onChange={() => setFloorAt(i)} /> floor
                </label>
                <button className="btn btn-sm" disabled={i === 0}
                        onClick={() => move(i, -1)}>↑</button>
                <button className="btn btn-sm" disabled={i === draft.length - 1}
                        onClick={() => move(i, 1)}>↓</button>
              </span>
            </div>
          ))}
          <label className="section-label mt-3">Why the path is changing</label>
          <input className="mt-1.5 w-full" value={reason}
                 placeholder="the reason on the record"
                 onChange={(e) => setReason(e.target.value)} data-testid="replace-reason" />
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={() => onDone(false)}>cancel</button>
            <button className="btn" disabled={reason.trim().length < 5}
                    data-testid="review-replace"
                    onClick={() => setConfirming(true)}>
              review what will be published…
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="caption" style={{ whiteSpace: 'pre-wrap' }}>
            {`A new ${ladder.category_label} · ${ladder.severity} ladder:\n`}
            {draft.map((s, i) =>
              `  rung ${i} · ${s.clause_id}@v${s.version}${i === floorAt ? '  ← the floor' : ''}`
            ).join('\n')}
            {`\nThe current ladder retires. Reason: ${reason.trim()}`}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={() => setConfirming(false)}>← back</button>
            <button className="btn btn-primary" disabled={busy}
                    data-testid="confirm-replace"
                    onClick={async () => {
                      setBusy(true); setError(null);
                      const r = await API.publishLadder({
                        category_key: ladder.category_key, severity: ladder.severity,
                        clause_ids: draft.map((s) => s.clause_id),
                        versions: draft.map((s) => s.version),
                        floor_rung: floorAt, reason: reason.trim(),
                      });
                      setBusy(false);
                      if (!r.ok) { setError(r.reason); setConfirming(false); return; }
                      onDone(true);
                    }}>
              {busy ? 'publishing…' : '✓ publish the replacement'}
            </button>
          </div>
        </div>
      )}
      <ActError error={error} />
    </div>
  );
}

// ── Ladders ───────────────────────────────────────────────────────────────
function LaddersPane() {
  const pane = usePane(() => API.ladders());
  const [acting, setActing] = useState(null); // { id, kind: 'floor'|'replace' }
  const [history, setHistory] = useState(false);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  // NO EARLY RETURN ON EMPTY. The rules and the promotion queue live on this
  // pane too, and an early return here made them unreachable the moment no
  // ladder existed — found in the browser on 2026-08-02, the exact
  // trap-5.2 shape: absence of one thing rendering as absence of everything.

  // Group the rung rows back into ladders. cw.ladder_board repeats the ladder's
  // health onto every rung so a table render needs no second result set; this
  // regroups for a per-ladder card.
  const ladders = [];
  for (const r of pane.rows) {
    let l = ladders.find((x) => x.ladder_id === r.ladder_id);
    if (!l) {
      l = { ladder_id: r.ladder_id, category_key: r.category_key,
            category_label: r.category_label,
            severity: r.severity, owner: r.owner, reviewed_on: r.reviewed_on,
            status: r.ladder_status, rungs: r.rungs, unusable: r.unusable_rungs,
            has_floor: r.has_floor, retired_on: r.retired_on, steps: [] };
      ladders.push(l);
    }
    // AN EMPTY LADDER ARRIVES AS ONE ROW WITH A NULL RUNG, and that row is the
    // one that matters most. cw.ladder_board LEFT JOINs its rungs precisely so a
    // rungless ladder still appears; dropping the null here would undo that at
    // the last possible moment and report a configuration error as absence.
    if (r.rung !== null && r.rung !== undefined) l.steps.push(r);
  }

  // The live board and the history. A retired ladder stays readable forever —
  // past concessions name its rungs — but it is history, not the retreat path.
  const live = ladders.filter((l) => !l.retired_on);
  const retired = ladders.filter((l) => l.retired_on);

  return (
    <div>
      <PanelHead title="Ladders & rules" sub="The retreat path, per category and severity." />

      {live.length === 0 && (
        <Empty
          kicker="ladders"
          line="No ladder is published."
          sub="A ladder is the pre-approved retreat: preferred position, fallback,
               floor. Without one, a negotiation has nothing to descend." />
      )}

      {live.length > 0 && <TileStrip tiles={[
        { label: 'ladders', n: live.length },
        { label: 'intact', n: live.filter((l) => l.status === 'intact').length },
        { label: 'need attention', n: live.filter((l) => l.status !== 'intact').length },
      ]} />}

      <div className="mt-4">
        {live.map((l) => (
          <div className="panel p-3 mb-3" key={l.ladder_id} data-testid="ladder">
            <div className="flex items-end justify-between">
              <div>
                <div className="section-label">{l.category_label} · {l.severity}</div>
                <div className="caption mt-0.5">
                  owner {l.owner}
                  {l.reviewed_on ? ` · reviewed ${l.reviewed_on}` : ' · never reviewed'}
                </div>
              </div>
              <span className={`chip ${l.status === 'intact' ? 'chip-ok'
                : l.status === 'empty' || l.status === 'floorless' || l.status === 'floor_unusable'
                  ? 'chip-err' : 'chip-pending'}`}
                    data-testid="ladder-status">
                {l.status}
              </span>
            </div>

            {l.steps.length === 0 ? (
              // The empty ladder, said out loud. This is a configuration error
              // somebody has to fix, and it must never render as a short healthy
              // list or as nothing at all.
              <div className="caption mt-2" data-testid="ladder-empty">
                <strong>This ladder has no rungs.</strong> A negotiation reaching
                this category and severity has nothing to retreat to, and the
                engine will refuse to descend it rather than invent a position.
              </div>
            ) : (
              <div className="mt-2">
                {l.steps.map((r) => (
                  <div className="flex gap-3 items-center mt-1.5" key={r.rung}
                       data-testid="rung">
                    <span className="font-mono caption shrink-0" style={{ width: 28 }}>
                      {r.rung}
                    </span>
                    <span className="text-[13px] min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                      {r.rung_title ?? r.clause_id}
                      <span className="caption"> · {r.clause_id}@v{r.version}</span>
                    </span>
                    <span className="flex gap-2 items-center shrink-0 ml-3">
                      {r.is_floor && <span className="chip chip-std">floor</span>}
                      {!r.rung_selectable && (
                        <span className="chip chip-err" data-testid="rung-unusable">
                          {r.rung_state}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {l.unusable > 0 && (
                  <div className="caption mt-2">
                    {l.unusable} of {l.rungs} rungs cannot be used. They stay on the
                    ladder because removing them would hide the problem rather than
                    fix it — the wording behind them needs replacing.
                  </div>
                )}
                {!l.has_floor && (
                  <div className="caption mt-2">
                    <strong>No floor.</strong> Nothing marks the position below
                    which this category may not go, so there is no stopping point
                    to enforce.
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-sm" data-testid="open-floor"
                          onClick={() => setActing(
                            acting?.id === l.ladder_id && acting?.kind === 'floor'
                              ? null : { id: l.ladder_id, kind: 'floor' })}>
                    move the floor…
                  </button>
                  <button className="btn btn-sm" data-testid="open-replace"
                          onClick={() => setActing(
                            acting?.id === l.ladder_id && acting?.kind === 'replace'
                              ? null : { id: l.ladder_id, kind: 'replace' })}>
                    replace this ladder…
                  </button>
                </div>
                {acting?.id === l.ladder_id && acting.kind === 'floor' && (
                  <FloorForm ladder={l}
                    onDone={(did) => { setActing(null); if (did) pane.reload(); }} />
                )}
                {acting?.id === l.ladder_id && acting.kind === 'replace' && (
                  <ReplaceLadderForm ladder={l}
                    onDone={(did) => { setActing(null); if (did) pane.reload(); }} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {retired.length > 0 && (
        <div className="mt-4">
          <button className="btn btn-sm" data-testid="ladder-history"
                  onClick={() => setHistory(!history)}>
            {history ? 'hide' : 'show'} retired ladders ({retired.length})
          </button>
          {history && retired.map((l) => (
            <div className="panel p-3 mt-2" key={l.ladder_id} data-testid="retired-ladder">
              <div className="section-label">
                {l.category_label} · {l.severity} · retired {l.retired_on}
              </div>
              <div className="caption mt-1">
                Kept readable forever: concessions taken on this ladder name its
                rungs, and those records keep meaning what they meant.
              </div>
              {l.steps.map((r) => (
                <div className="caption mt-1" key={r.rung}>
                  rung {r.rung} · {r.clause_id}@v{r.version}{r.is_floor ? ' · was the floor' : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <RulesSection />
      <PromotionSection />
    </div>
  );
}

// ── Conflict rules: published as versions, retired with a reason ──────────
// A rule is a legal judgement expressed as data. "Editing" one is publishing
// its next version — cw.active_conflict_rule takes the latest effective one,
// so the predecessor stops deciding without being touched.
function RulesSection() {
  const pane = usePane(() => API.rules());
  const [authoring, setAuthoring] = useState(false);
  const [retiring, setRetiring] = useState(null); // `${rule_id}@${version}`
  const [reason, setReason] = useState('');
  const [form, setForm] = useState({
    rule_id: '', name: '', severity: 'Standard', title: '', detail: '',
    primitive: 'all_present', value: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  // The catalogue, newest version first within each rule.
  const rules = [...pane.rows].sort((a, b) =>
    a.rule_id === b.rule_id ? b.version - a.version
      : a.rule_id < b.rule_id ? -1 : 1);
  const latest = new Map();
  for (const r of pane.rows) {
    if (!latest.has(r.rule_id) || latest.get(r.rule_id) < r.version)
      latest.set(r.rule_id, r.version);
  }

  const predicate = () =>
    form.primitive === 'conflicting_values'
      ? { conflicting_values: form.value.trim() }
      : { [form.primitive]: form.value.split(',').map((s) => s.trim()).filter(Boolean) };

  return (
    <div className="mt-6">
      <PanelHead title="Conflict rules" sub="What may not appear together, as data with a version." />
      {rules.length === 0 ? (
        <Empty kicker="rules" line="No conflict rule has been published."
               sub="A rule is authored here and versioned like wording: published,
                    effective, retirable — never edited in place." />
      ) : (
        <div className="panel">
          {rules.map((r) => {
            const key = `${r.rule_id}@${r.version}`;
            const inForce = !r.retired && latest.get(r.rule_id) === r.version;
            return (
              <div className="waiting-row" key={key} style={{ alignItems: 'flex-start' }}>
                <div className="min-w-0">
                  <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                    {r.title}
                    <span className="caption"> · {r.rule_id}@v{r.version} · {r.severity}</span>
                  </div>
                  <div className="caption mt-0.5">{r.detail}</div>
                  <div className="caption mt-0.5 font-mono">{JSON.stringify(r.predicate)}</div>
                  {r.retired && (
                    <div className="caption mt-0.5">retired — {r.retired_reason}</div>
                  )}
                  {retiring === key && (
                    <div className="flex gap-2 mt-2 items-end" data-testid="rule-retire-form">
                      <input className="w-full" placeholder="why it is withdrawn"
                             value={reason} onChange={(e) => setReason(e.target.value)} />
                      <button className="btn btn-sm" onClick={() => setRetiring(null)}>cancel</button>
                      <button className="btn btn-sm btn-primary" disabled={busy || !reason.trim()}
                              data-testid="confirm-rule-retire"
                              onClick={async () => {
                                setBusy(true); setError(null);
                                const res = await API.retireRule({
                                  rule_id: r.rule_id, version: r.version,
                                  reason: reason.trim(),
                                });
                                setBusy(false);
                                if (!res.ok) { setError(res.reason); return; }
                                setRetiring(null); setReason(''); pane.reload();
                              }}>✓ retire</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`chip ${r.retired ? 'chip-err' : inForce ? 'chip-ok' : 'chip-std'}`}>
                    {r.retired ? 'retired' : inForce ? 'in force' : 'superseded'}
                  </span>
                  {!r.retired && (
                    <button className="btn btn-sm" data-testid="open-rule-retire"
                            onClick={() => { setRetiring(retiring === key ? null : key); setReason(''); }}>
                      retire…
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!authoring ? (
        <button className="btn mt-3" data-testid="open-rule-form"
                onClick={() => setAuthoring(true)}>
          publish a rule…
        </button>
      ) : (
        <div className="panel p-3 mt-3" data-testid="rule-form">
          <div className="section-label">publish a rule version</div>
          <div className="caption mt-1">
            Publishing under an existing id mints its next version, which takes
            over from the current one. Three primitives, nothing else — a rule a
            lawyer cannot say in them needs a new primitive added deliberately,
            not a freer grammar.
          </div>
          <div className="flex gap-3 mt-2">
            <div>
              <label className="section-label">Rule id</label>
              <input className="mt-1.5 font-mono" style={{ width: 120 }} placeholder="DP-001"
                     value={form.rule_id}
                     onChange={(e) => setForm({ ...form, rule_id: e.target.value })} />
            </div>
            <div>
              <label className="section-label">Name</label>
              <input className="mt-1.5" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="section-label">Severity</label>
              <select className="mt-1.5 font-mono" value={form.severity}
                      onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option>Standard</option><option>High</option>
              </select>
            </div>
          </div>
          <label className="section-label mt-3">Title</label>
          <input className="mt-1.5 w-full" value={form.title}
                 onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className="section-label mt-3">What it asks, in words</label>
          <input className="mt-1.5 w-full" value={form.detail}
                 onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          <div className="flex gap-3 mt-3 items-end">
            <div>
              <label className="section-label">Primitive</label>
              <select className="mt-1.5 font-mono" value={form.primitive}
                      onChange={(e) => setForm({ ...form, primitive: e.target.value })}>
                <option value="all_present">all present</option>
                <option value="none_present">none present</option>
                <option value="conflicting_values">conflicting values</option>
              </select>
            </div>
            <div className="min-w-0 grow">
              <label className="section-label">
                {form.primitive === 'conflicting_values'
                  ? 'Tag namespace' : 'Tags, comma-separated'}
              </label>
              <input className="mt-1.5 w-full font-mono" value={form.value}
                     onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn" onClick={() => setAuthoring(false)}>cancel</button>
            <button className="btn btn-primary" data-testid="confirm-rule"
                    disabled={busy || !form.rule_id.trim() || !form.name.trim()
                              || !form.title.trim() || !form.detail.trim() || !form.value.trim()}
                    onClick={async () => {
                      setBusy(true); setError(null);
                      const res = await API.publishRule({
                        rule_id: form.rule_id.trim(), name: form.name.trim(),
                        severity: form.severity, title: form.title.trim(),
                        detail: form.detail.trim(), predicate: predicate(),
                      });
                      setBusy(false);
                      if (!res.ok) { setError(res.reason); return; }
                      setAuthoring(false);
                      setForm({ rule_id: '', name: '', severity: 'Standard',
                                title: '', detail: '', primitive: 'all_present', value: '' });
                      pane.reload();
                    }}>
              {busy ? 'publishing…' : '✓ publish'}
            </button>
          </div>
          <ActError error={error} />
        </div>
      )}
      <ActError error={retiring ? error : null} />
    </div>
  );
}

// ── Concession promotion: vendor-shaped wording enters the library ────────
function PromotionSection() {
  const pane = usePane(() => API.concessions());
  const [promoting, setPromoting] = useState(null); // concession_id
  const [form, setForm] = useState({ new_clause_id: '', title: '', rationale: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  // Promotable: settled, and not settled on a pre-approved rung — a rung is
  // already library language and the function will say so. The endpoint is the
  // judge; this filter only keeps the list honest at a glance.
  const candidates = pane.rows.filter((c) => c.state === 'approved' || c.state === 'settled');

  return (
    <div className="mt-6">
      <PanelHead title="Concession promotion"
                 sub="The second of the library's two recorded entrances." />
      {candidates.length === 0 ? (
        <Empty kicker="promotion" line="No settled concession is waiting."
               sub="When the same ground is conceded again and again, promoting it
                    turns the retreat into an approved position." />
      ) : (
        <div className="panel">
          {candidates.map((c) => (
            <div className="waiting-row" key={c.concession_id} style={{ alignItems: 'flex-start' }}>
              <div className="min-w-0">
                <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  {c.agreement_id} · {c.category_key}
                  <span className="caption"> · from {c.standard_clause_id}@v{c.standard_version}
                    {c.conceded_rung !== null && c.conceded_rung !== undefined
                      ? ` · to rung ${c.conceded_rung}` : ' · vendor wording'}</span>
                </div>
                <div className="caption mt-0.5">{c.reason}</div>
                {promoting === c.concession_id && (
                  <div className="panel p-3 mt-2" data-testid="promote-form">
                    <div className="flex gap-3">
                      <div>
                        <label className="section-label">New clause id</label>
                        <input className="mt-1.5 font-mono" style={{ width: 130 }}
                               placeholder="DP-S-009" value={form.new_clause_id}
                               onChange={(e) => setForm({ ...form, new_clause_id: e.target.value })} />
                      </div>
                      <div className="grow">
                        <label className="section-label">Title</label>
                        <input className="mt-1.5 w-full" value={form.title}
                               onChange={(e) => setForm({ ...form, title: e.target.value })} />
                      </div>
                    </div>
                    <label className="section-label mt-3">Why it becomes a position</label>
                    <input className="mt-1.5 w-full" value={form.rationale}
                           placeholder="e.g. conceded three times this quarter; the market has moved"
                           onChange={(e) => setForm({ ...form, rationale: e.target.value })} />
                    <div className="flex gap-2 mt-3">
                      <button className="btn" onClick={() => setPromoting(null)}>cancel</button>
                      <button className="btn btn-primary" data-testid="confirm-promote"
                              disabled={busy || !form.new_clause_id.trim()
                                        || !form.title.trim() || !form.rationale.trim()}
                              onClick={async () => {
                                setBusy(true); setError(null);
                                const res = await API.promoteConcession({
                                  concession_id: c.concession_id,
                                  new_clause_id: form.new_clause_id.trim(),
                                  title: form.title.trim(),
                                  rationale: form.rationale.trim(),
                                });
                                setBusy(false);
                                if (!res.ok) { setError(res.reason); return; }
                                setPromoting(null);
                                setForm({ new_clause_id: '', title: '', rationale: '' });
                                pane.reload();
                              }}>
                        {busy ? 'promoting…' : '✓ promote into the library'}
                      </button>
                    </div>
                    <ActError error={error} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="chip chip-std">{c.state}</span>
                <button className="btn btn-sm" data-testid="open-promote"
                        onClick={() => { setPromoting(
                          promoting === c.concession_id ? null : c.concession_id);
                          setError(null); }}>
                  promote…
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Governance: the owner decisions, with the edit that demands a reason ──
// WP-U13's third surface. Reading is everybody's; DECIDING an owner-decision
// row is gated by the settings split (settings-split.test.mjs) and the
// rationale is demanded by the endpoint, not this form.
function GovernancePane() {
  const pane = usePane(() => API.settings());
  const [editing, setEditing] = useState(null); // key
  const [value, setValue] = useState('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const decisions = pane.rows.filter((s) => s.is_owner_decision);
  const operational = pane.rows.filter((s) => !s.is_owner_decision);

  return (
    <div>
      <PanelHead title="Owner decisions"
                 sub="What the owner settled, held as data the schema enforces." />
      {decisions.length === 0 ? (
        <Empty kicker="governance" line="No owner decision is recorded." />
      ) : (
        <div className="panel">
          {decisions.map((s) => (
            <div className="waiting-row" key={s.key} style={{ alignItems: 'flex-start' }}>
              <div className="min-w-0">
                <div className="text-[13px] font-mono" style={{ color: 'var(--ink)' }}>
                  {s.key} = {s.value}
                </div>
                <div className="caption mt-0.5" style={{ whiteSpace: 'pre-wrap' }}>
                  {s.rationale || 'No rationale recorded.'}
                </div>
                {editing === s.key && (
                  <div className="panel p-3 mt-2" data-testid="decide-form">
                    <div className="flex gap-3">
                      <div>
                        <label className="section-label">New value</label>
                        <input className="mt-1.5 font-mono" value={value}
                               onChange={(e) => setValue(e.target.value)} />
                      </div>
                      <div className="grow">
                        <label className="section-label">Why it changes</label>
                        <input className="mt-1.5 w-full" value={rationale}
                               placeholder="required — a decision with no reasoning cannot be reviewed"
                               onChange={(e) => setRationale(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button className="btn" onClick={() => setEditing(null)}>cancel</button>
                      <button className="btn btn-primary" data-testid="confirm-decide"
                              disabled={busy || !value.trim() || !rationale.trim()}
                              onClick={async () => {
                                setBusy(true); setError(null);
                                const r = await API.decideSetting({
                                  key: s.key, value: value.trim(),
                                  rationale: rationale.trim(),
                                });
                                setBusy(false);
                                if (!r.ok) { setError(r.reason); return; }
                                setEditing(null); pane.reload();
                              }}>
                        {busy ? 'recording…' : '✓ record the decision'}
                      </button>
                    </div>
                    <ActError error={error} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`chip ${s.decided ? 'chip-ok' : 'chip-pending'}`}>
                  {s.decided ? `decided by ${s.decided_by}` : 'undecided'}
                </span>
                <button className="btn btn-sm" data-testid="open-decide"
                        onClick={() => {
                          setEditing(editing === s.key ? null : s.key);
                          setValue(s.value ?? ''); setRationale(''); setError(null);
                        }}>
                  decide…
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {operational.length > 0 && (
        <div className="caption mt-4">
          {operational.length} operational settings are the Administrator's and
          live in the console, not here — the split is the control, both ways.
        </div>
      )}
    </div>
  );
}

// ── Holds & retention: the Legal admin's half of disposal ─────────────────
// Opening a hold is Legal's act (the reviewer desk has it too); RELEASING one
// is the Legal admin's alone, and it is here. Destruction, redaction and the
// purge are the Administrator's and live in the console — a greyed-out
// destroy button here would say "you could, but not now"; the truth is that
// it is somebody else's act entirely.
function RetentionPane() {
  const pane = usePane(() => API.holds());
  const disposal = usePane(() => API.redactionState());
  const [releasing, setReleasing] = useState(null); // hold_id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const open = pane.rows.filter((h) => !h.released_on);
  const released = pane.rows.filter((h) => h.released_on);

  return (
    <div>
      <PanelHead title="Holds & retention"
                 sub="A hold blocks disposal while a matter is live. Releasing it is your act, on the record." />

      {open.length === 0 ? (
        <Empty kicker="holds" line="No hold is open."
               sub="A hold stops destruction for a dispute. Open ones appear here
                    with their matter, and releasing them is recorded." />
      ) : (
        <div className="panel">
          {open.map((h) => (
            <div className="waiting-row" key={h.hold_id} style={{ alignItems: 'flex-start' }}>
              <div className="min-w-0">
                <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  {h.agreement_id}
                  <span className="caption"> · {h.matter_ref} · opened by {h.opened_by} on {h.opened_on}</span>
                </div>
                {releasing === h.hold_id && (
                  <div className="panel p-3 mt-2" data-testid="release-form">
                    <div className="caption">
                      Releasing this hold lets the retention clock reach
                      {' '}{h.agreement_id} again. The release is recorded under
                      your name, and a released hold can never reopen — a new
                      matter is a new hold.
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button className="btn" onClick={() => setReleasing(null)}>← back</button>
                      <button className="btn btn-primary" disabled={busy}
                              data-testid="confirm-release"
                              onClick={async () => {
                                setBusy(true); setError(null);
                                const r = await API.releaseHold({ hold_id: h.hold_id });
                                setBusy(false);
                                if (!r.ok) { setError(r.reason); return; }
                                setReleasing(null); pane.reload();
                              }}>
                        {busy ? 'releasing…' : '✓ release this hold'}
                      </button>
                    </div>
                    <ActError error={error} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="chip chip-high">open</span>
                <button className="btn btn-sm" data-testid="open-release"
                        onClick={() => { setReleasing(
                          releasing === h.hold_id ? null : h.hold_id);
                          setError(null); }}>
                  release…
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {released.length > 0 && (
        <div className="caption mt-3" data-testid="released-holds">
          {released.length} released hold{released.length === 1 ? '' : 's'} on the
          record: {released.map((h) =>
            `${h.agreement_id} (${h.matter_ref}, released by ${h.released_by} ${h.released_on})`
          ).join(' · ')}
        </div>
      )}

      <div className="mt-6">
        <PanelHead title="Disposal, as it stands"
                   sub="Destroy, then redact, then purge — each a separate recorded act, none of them yours." />
        {disposal.status === 'loading' ? <Loading /> :
         disposal.status === 'failed' ? <LoadFailed reason={disposal.reason} /> :
         disposal.rows.length === 0 ? (
          <Empty kicker="disposal" line="Nothing is in the disposal pipeline." />
        ) : (
          <div className="panel">
            {disposal.rows.map((d) => (
              <div className="waiting-row" key={d.agreement_id}>
                <div className="min-w-0">
                  <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                    {d.agreement_id}
                    <span className="caption">
                      {d.retention_until ? ` · retention until ${d.retention_until}` : ''}
                      {d.destroyed_on ? ` · destroyed ${d.destroyed_on} by ${d.destroyed_by}` : ''}
                      {d.redacted_on ? ` · redacted ${d.redacted_on} by ${d.redacted_by}` : ''}
                      {d.purged_on ? ` · purged ${d.purged_on} by ${d.purged_by}` : ''}
                    </span>
                  </div>
                  {d.external_bytes_pending && (
                    // THE HONEST CAVEAT, rendered rather than smoothed over.
                    <div className="caption mt-0.5" data-testid="external-bytes">
                      <strong>Bytes may survive outside.</strong> Redaction severed
                      this system's link to the stored file; it does not reach into
                      an external store. Only the purge closes that.
                    </div>
                  )}
                </div>
                <span className={`chip ${d.state === 'live' ? 'chip-ok'
                  : d.state === 'purged' ? 'chip-err' : 'chip-pending'}`}>
                  {d.state}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="caption mt-3">
          Destruction under retention, redaction and the purge belong to the
          Administrator (owner decisions U9 and U12) and are performed in the
          console. This page is Legal's window onto where each record stands.
        </div>
      </div>
    </div>
  );
}
