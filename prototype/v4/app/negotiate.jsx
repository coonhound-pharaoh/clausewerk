// The negotiation surfaces (NG-1 … NG-4).
//
// FOUR ROLES, ONE SET OF COMPONENTS, THREE COMPOSITIONS. The requester works
// their own deals, the Legal reviewer and the Legal admin work every deal from
// the same desk, and the auditor reads a negotiation inside the record and acts
// on nothing. What differs between them is the ORDER things appear in and which
// acts are offered — never the shape of a position row, because this product
// has already paid once for four near-identical status tiles drifting apart.
//
// WHAT THE SCREEN DOES NOT DO, and this is the load-bearing half:
//
//   · It never checks a permission. The round sequence (cw.round_is_next), the
//     concession floor, who may approve a concession, and who may write against
//     which deal are all the schema's sentences. This offers the act and shows
//     the refusal in the database's own words — a pre-flight in JavaScript is a
//     second copy of a rule, and two copies stop agreeing.
//
//   · It never fetches broadly and filters for permission. Every read here
//     takes no parameter: the scoping is "these deals, this person" and it
//     arrives on the connection. Filtering by negotiation_id on screen is
//     narrowing what the rule ALREADY returned, which is a different act
//     entirely from asking for somebody else's rows and hiding them.
//
//   · It never dresses a position state as a status mark. A position is
//     opened, held, conceded, withdrawn, escalated or settled — six domain
//     states, not the five in common.jsx's vocabulary. They render as plain
//     words with the rung beside them. The one thing here that IS a status
//     mark is a concession's approval state, because that is a thing being in
//     force or not yet in force.

const { useState } = React;

// ── Reading the record ────────────────────────────────────────────────────
// Every negotiation surface needs the same six answers, so they are fetched
// once, here, and handed down. Six calls rather than one wide one: each is its
// own rule, and an endpoint that returned "everything about a negotiation"
// would be one rule standing in for six.
function useNegotiationRecord() {
  const negotiations = usePane(() => API.negotiations());
  const rounds       = usePane(() => API.negotiationRounds());
  const positions    = usePane(() => API.positions());
  const movements    = usePane(() => API.positionMovements());
  const revivals     = usePane(() => API.revivals());
  const drift        = usePane(() => API.renewalDrift());
  const concessions  = usePane(() => API.concessions());
  // The deal list, for counterparty names. Fetched HERE rather than in each
  // pane so the two compositions cannot end up asking different questions
  // about the same deals.
  const deals        = usePane(() => API.deals());

  const panes = [negotiations, rounds, positions, movements, revivals, drift,
                 concessions, deals];
  return {
    negotiations, rounds, positions, movements, revivals, drift, concessions,
    deals,
    loading: panes.some((p) => p.status === 'loading'),
    // The FIRST failure, with its sentence. A screen that renders half a
    // negotiation because one read refused is a screen quietly deciding which
    // half of a record is worth showing.
    failed: panes.find((p) => p.status === 'failed') || null,
    reloadAll: () => panes.forEach((p) => p.reload()),
  };
}

// ── One negotiation, in a list ────────────────────────────────────────────
function NegotiationRow({ negotiation, deals, positions, rounds }) {
  const deal = deals.find((d) => d.agreement_id === negotiation.agreement_id);
  const mine = positions.filter((p) => p.negotiation_id === negotiation.negotiation_id);
  const open = mine.filter((p) => !['settled', 'withdrawn'].includes(p.state));
  const escalated = mine.filter((p) => p.state === 'escalated');
  const lastRound = rounds
    .filter((r) => r.negotiation_id === negotiation.negotiation_id)
    .reduce((n, r) => Math.max(n, r.round_no), 0);

  return {
    key: String(negotiation.negotiation_id),
    title: deal ? deal.counterparty : negotiation.agreement_id,
    sub: `${negotiation.agreement_id} · ${negotiation.paper === 'ours' ? 'our paper' : 'their paper'}`
         + ` · round ${lastRound || 'none yet'}`,
    // Oldest first is the desk's rule, and the date a negotiation opened is
    // the honest thing to age it by until something is waiting on somebody.
    at: negotiation.opened_on,
    chips: (
      <span className="flex items-center gap-2">
        {negotiation.renews_agreement_id && (
          <span className="chip chip-std" title={`renews ${negotiation.renews_agreement_id}`}>renewal</span>
        )}
        {escalated.length > 0 && (
          <span className="chip chip-pending">{escalated.length} with Legal</span>
        )}
        <span className="chip chip-std">{open.length} open</span>
      </span>
    ),
  };
}

// ── The rounds strip ──────────────────────────────────────────────────────
// What was exchanged, in order, with the fingerprint of each document. The
// fingerprint is shown because it is the only thing that makes the round
// EVIDENCE rather than a note that something was sent.
function Rounds({ negotiation, rounds, onError, onRecorded, canAct }) {
  const [busy, setBusy] = useState(false);
  const mine = rounds
    .filter((r) => r.negotiation_id === negotiation.negotiation_id)
    .sort((a, b) => a.round_no - b.round_no);
  const next = mine.reduce((n, r) => Math.max(n, r.round_no), 0) + 1;

  const take = async (file) => {
    setBusy(true); onError(null);
    const r = await API.recordRedline(negotiation.agreement_id, file);
    setBusy(false);
    if (!r.ok) { onError(r.reason); return; }
    onRecorded();
  };

  return (
    <div className="panel p-4 mt-6">
      <PanelHead
        title="Rounds"
        sub="What was exchanged, in order. The record is append-only and gapless — the database refuses a round that skips one." />

      {mine.length === 0
        ? <Empty
            kicker="rounds"
            line="Nothing has been exchanged yet."
            sub="A negotiation with no rounds is a negotiation that has been opened and not yet started. That is a real state, not a missing screen." />
        : mine.map((r) => (
            <div className="flex items-baseline justify-between py-2 border-b hair"
                 key={r.round_no} data-testid="negotiation-round">
              <div className="min-w-0">
                <span className="font-mono text-[12.5px]">round {r.round_no}</span>
                <span className="ml-3 text-[12.5px]" style={{ color: 'var(--mute)' }}>
                  {r.direction === 'received' ? 'in, from them' : 'out, to them'}
                  {r.sent_on && ` · ${r.sent_on}`}
                </span>
                <div className="caption font-mono mt-0.5 truncate" title={r.document_sha256}>
                  {r.document_sha256}
                </div>
              </div>
              {/* THE DOCUMENT, BACK OUT (owner decision NI-4). Offered only for
                  a round whose bytes this system actually holds — a round
                  recorded for a document kept elsewhere says so instead of
                  offering a button that will refuse. */}
              {String(r.storage_uri || '').startsWith('cw://received-document/')
                ? <button className="btn btn-sm" data-testid="fetch-paper"
                          onClick={async () => {
                            onError(null);
                            const got = await API.supplierPaper(
                              r.negotiation_id, r.round_no);
                            if (!got.ok) { onError(got.reason); return; }
                            saveBlob(got.blob, got.filename);
                          }}>
                    their document
                  </button>
                : <span className="caption">held elsewhere</span>}
            </div>
          ))}

      {canAct && (
        <div className="mt-4 pt-3 border-t hair">
          <div className="section-label">Record what they sent back</div>
          <div className="flex items-center gap-3 mt-2">
            <input type="file" data-testid="redline-upload" disabled={busy}
                   onChange={(e) => {
                     const file = e.target.files && e.target.files[0];
                     e.target.value = '';
                     if (file) take(file);
                   }} />
            <span className="caption">
              It lands as round {next}. The fingerprint is the database's own
              arithmetic over the bytes — nothing here can supply one.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── One position ──────────────────────────────────────────────────────────
// The same component wherever a position appears. `acts` decides what is
// offered; it never decides what is permitted.
function Position({ position, movements, roundNow, onError, onMoved, acts }) {
  const [note, setNote] = useState('');
  const [rung, setRung] = useState('');
  const [busy, setBusy] = useState(false);
  const [showing, setShowing] = useState(false);

  const history = movements
    .filter((m) => m.position_id === position.position_id)
    .sort((a, b) => a.movement_id - b.movement_id);

  const act = async (call) => {
    setBusy(true); onError(null);
    const r = await call();
    setBusy(false);
    if (!r.ok) { onError(r.reason); return; }
    setNote(''); setRung('');
    onMoved();
  };

  return (
    <div className="panel-2 p-3 mb-2" data-testid="position">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-[12.5px]">{position.category_key}</span>
          {/* A DOMAIN STATE, AS A WORD. Not a Status chip: these six are not
              the five-state vocabulary, and borrowing its inks would make
              "held" look like a governance state it is not. */}
          <span className="ml-3 text-[12.5px]" style={{ color: 'var(--ink)' }}>
            {position.state}
          </span>
          {position.current_rung !== null && position.current_rung !== undefined && (
            <span className="ml-2 caption">at rung {position.current_rung}</span>
          )}
        </div>
        <div className="caption">
          raised round {position.round_raised} · from {position.opened_from.replace('_', ' ')}
        </div>
      </div>

      {position.our_clause_id && (
        <div className="caption font-mono mt-1">
          {position.our_clause_id} v{position.our_version}
        </div>
      )}

      <button className="btn btn-sm mt-2" onClick={() => setShowing(!showing)}>
        {showing ? 'hide' : `how it got here (${history.length})`}
      </button>

      {showing && (
        <div className="mt-2">
          {history.length === 0
            ? <div className="caption">No movement is recorded on this position.</div>
            : history.map((m) => (
                <div className="py-1.5 border-b hair" key={m.movement_id}>
                  <div className="text-[12.5px]">
                    <span className="font-mono">round {m.round_no}</span>
                    <span className="ml-2">{m.to_state}</span>
                    {m.current_rung !== null && m.current_rung !== undefined && (
                      <span className="ml-2 caption">rung {m.current_rung}</span>
                    )}
                  </div>
                  <div className="caption font-mono">{m.actor} · {since(m.moved_at)}</div>
                  {m.note && (
                    <div className="font-serif italic mt-1"
                         style={{ fontSize: 13.5, color: 'var(--mute)' }}>
                      {m.note}
                    </div>
                  )}
                </div>
              ))}
        </div>
      )}

      {acts && (
        <div className="mt-3 pt-3 border-t hair">
          <div className="flex gap-2 items-end">
            <div style={{ width: 90 }}>
              <label className="caption">Rung</label>
              <input className="mt-1 w-full font-mono" style={{ padding: '4px 8px' }}
                     value={rung} onChange={(e) => setRung(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="caption">Why</label>
              <input className="mt-1 w-full" style={{ padding: '4px 8px' }}
                     data-testid="position-note"
                     value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 mt-2 flex-wrap">
            {['held', 'conceded', 'withdrawn', 'settled'].map((to) => (
              <button className="btn btn-sm" key={to} disabled={busy}
                      data-testid={`move-${to}`}
                      onClick={() => act(() => API.movePosition({
                        position_id: position.position_id,
                        round_no: roundNow,
                        to_state: to,
                        current_rung: rung.trim() === '' ? null : Number(rung),
                        note: note.trim() || null,
                      }))}>
                {to}
              </button>
            ))}
            {/* ESCALATION IS ITS OWN BUTTON, and it is not in the row above.
                Nobody should reach Legal by typing a string into a state
                field — the endpoint agrees, which is why 'escalated' is not
                the caller's to choose there either. */}
            <button className="btn btn-sm" disabled={busy}
                    data-testid="escalate"
                    style={{ borderColor: 'var(--accent)' }}
                    onClick={() => act(() => API.escalatePosition({
                      position_id: position.position_id,
                      round_no: roundNow,
                      current_rung: rung.trim() === '' ? null : Number(rung),
                      note: note.trim() || null,
                    }))}>
              hand to Legal
            </button>
          </div>

          {/* TWO ACTS, TWO BUTTONS — owner decision NI-3. Escalating records
              the movement. Opening a ticket is a second governed act with its
              own reason, and it is performed knowingly or not at all. */}
          {position.state === 'escalated' && (
            <div className="caption mt-2">
              This is with Legal. Opening a review ticket for the wording is a
              separate act, on the review desk — escalating does not open one,
              deliberately.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Positions, with the act that opens one ────────────────────────────────
function Positions({ negotiation, positions, movements, roundNow, categories,
                    onError, onChanged, acts }) {
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState({ category_key: '', opened_from: 'library_standard' });
  const [busy, setBusy] = useState(false);

  const mine = positions
    .filter((p) => p.negotiation_id === negotiation.negotiation_id)
    .sort((a, b) => a.position_id - b.position_id);

  return (
    <div className="panel p-4 mt-6">
      <PanelHead
        title="Positions"
        sub="One row per contested point, from first raised to finally settled. The rung is where the retreat has reached."
        right={acts && (
          <button className="btn btn-sm" onClick={() => setAdding(!adding)}>
            {adding ? 'cancel' : '+ raise a point'}
          </button>
        )} />

      {adding && (
        <div className="panel-2 p-3 mb-3">
          <div className="flex gap-2 items-end">
            <div style={{ width: 220 }}>
              <label className="caption">Category</label>
              <select className="mt-1 w-full font-mono" style={{ padding: '5px 8px' }}
                      data-testid="new-position-category"
                      value={fresh.category_key}
                      onChange={(e) => setFresh({ ...fresh, category_key: e.target.value })}>
                <option value="">choose…</option>
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>{c.key} — {c.label}</option>
                ))}
              </select>
            </div>
            <div style={{ width: 200 }}>
              <label className="caption">Opened from</label>
              <select className="mt-1 w-full font-mono" style={{ padding: '5px 8px' }}
                      value={fresh.opened_from}
                      onChange={(e) => setFresh({ ...fresh, opened_from: e.target.value })}>
                <option value="library_standard">library standard</option>
                <option value="executed_agreement">last term's position</option>
                <option value="their_paper">their paper</option>
              </select>
            </div>
            <button className="btn btn-primary" disabled={busy || !fresh.category_key}
                    data-testid="open-position"
                    onClick={async () => {
                      setBusy(true); onError(null);
                      const r = await API.openPosition({
                        negotiation_id: negotiation.negotiation_id,
                        category_key: fresh.category_key,
                        round_raised: roundNow,
                        opened_from: fresh.opened_from,
                      });
                      setBusy(false);
                      if (!r.ok) { onError(r.reason); return; }
                      setFresh({ category_key: '', opened_from: 'library_standard' });
                      setAdding(false);
                      onChanged();
                    }}>✓ raise it</button>
          </div>
        </div>
      )}

      {mine.length === 0
        ? <Empty
            kicker="positions"
            line="No point is contested."
            sub="Nothing has been raised on this negotiation. That is the whole answer — there is no filter hiding anything." />
        : mine.map((p) => (
            <Position key={p.position_id} position={p} movements={movements}
                      roundNow={roundNow} onError={onError} onMoved={onChanged}
                      acts={acts} />
          ))}
    </div>
  );
}

// ── The same argument, reopening ──────────────────────────────────────────
function Revivals({ negotiation, revivals }) {
  const mine = revivals.filter((r) => r.negotiation_id === negotiation.negotiation_id);
  return (
    <div className="panel p-4 mt-6">
      <PanelHead
        title="Points being reopened"
        sub="A position that was settled and is being argued again. Live from the first round — that is what the record is for." />
      {/* EMPTY IS GOOD NEWS AND MUST SAY SO. A blank area here reads as a
          screen that failed to load, and the two facts are opposites. */}
      {mine.length === 0
        ? <div className="caption">None. No settled point is being renegotiated.</div>
        : mine.map((r) => (
            <div className="flex items-baseline justify-between py-2 border-b hair"
                 key={r.position_id}>
              <span className="font-mono text-[12.5px]">{r.category_key}</span>
              <span className="caption">
                held {r.times_held} times · first round {r.first_held_round} ·
                last round {r.last_round}
              </span>
            </div>
          ))}
    </div>
  );
}

// ── What a renewal is carrying ────────────────────────────────────────────
// U1's control. It stays in front of whoever opened the renewal rather than
// behind a link, because the whole hazard is starting from stale language
// without noticing.
function Drift({ negotiation, drift }) {
  if (!negotiation.renews_agreement_id) return null;
  const mine = drift.filter((d) => d.negotiation_id === negotiation.negotiation_id);
  return (
    <div className="panel p-4 mt-6" data-testid="renewal-drift">
      <PanelHead
        title="What this renewal opened from"
        sub={`Opened from ${negotiation.baseline === 'executed_agreement'
          ? "last term's executed positions" : 'current library standard'}. This report rewrites nothing.`} />
      {mine.length === 0
        ? <div className="caption">
            Nothing has moved in the library since the positions this renewal
            opened from.
          </div>
        : mine.map((d) => (
            <div className="flex items-baseline justify-between py-2 border-b hair"
                 key={`${d.clause_id}-${d.executed_version}`}>
              <div>
                <span className="font-mono text-[12.5px]">{d.clause_id}</span>
                <span className="ml-2 caption">
                  in force v{d.executed_version}
                  {d.successor_version && ` · library is now v${d.successor_version}`}
                </span>
              </div>
              <Status state={d.current_state === 'superseded' ? 'superseded' : 'effective'}>
                {d.current_state}
              </Status>
            </div>
          ))}
    </div>
  );
}

// ── Concessions on this deal ──────────────────────────────────────────────
// Settling at a fallback needs BOTH the requester and the assigned attorney.
// The screen offers the half the person in front of it can perform; the
// database decides whether they are one of the two named.
function Concessions({ negotiation, concessions, onError, onChanged, approverKind }) {
  const [busy, setBusy] = useState(false);
  const mine = concessions.filter((c) => c.agreement_id === negotiation.agreement_id);

  return (
    <div className="panel p-4 mt-6">
      <PanelHead
        title="Concessions"
        sub="Where this deal has settled below standard. Approval is two people, and a proposal confers nothing." />
      {mine.length === 0
        ? <div className="caption">Nothing has been conceded on this deal.</div>
        : mine.map((c) => (
            <div className="panel-2 p-3 mb-2" key={c.concession_id}
                 data-testid="concession">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-[12.5px]">{c.category_key}</span>
                  <span className="ml-2 caption">
                    {c.standard_clause_id} v{c.standard_version}
                    {c.conceded_rung !== null && c.conceded_rung !== undefined
                      && ` · to rung ${c.conceded_rung}`}
                  </span>
                </div>
                {/* THIS one is a status mark, and correctly: an approved
                    concession is in force and a proposed one confers nothing.
                    Amber, never green, while it waits. */}
                <Status state={c.state === 'approved' ? 'effective'
                             : c.state === 'withdrawn' ? 'superseded' : 'pending'}>
                  {c.state}
                </Status>
              </div>
              {c.reason && (
                <div className="panel-2 p-3 mt-2 relative">
                  <span className="font-serif" style={{
                    position: 'absolute', left: 6, top: -6, fontSize: 34,
                    color: 'var(--accent)', opacity: .55, lineHeight: 1 }}>“</span>
                  <div className="font-serif italic"
                       style={{ fontSize: 15, lineHeight: 1.6, paddingLeft: 22 }}>
                    {c.reason}
                  </div>
                </div>
              )}
              {approverKind && c.state === 'proposed' && (
                <button className="btn btn-sm mt-2" disabled={busy}
                        data-testid="approve-concession"
                        onClick={async () => {
                          setBusy(true); onError(null);
                          const r = await API.approveConcession({
                            concession_id: c.concession_id,
                            approver_kind: approverKind,
                          });
                          setBusy(false);
                          if (!r.ok) { onError(r.reason); return; }
                          onChanged();
                        }}>
                  approve as {approverKind}
                </button>
              )}
            </div>
          ))}
    </div>
  );
}

// ── One negotiation, opened ───────────────────────────────────────────────
function OpenNegotiation({ negotiation, record, deals, categories, onBack,
                          onError, acts, approverKind }) {
  const deal = deals.find((d) => d.agreement_id === negotiation.agreement_id);
  const roundNow = record.rounds.rows
    .filter((r) => r.negotiation_id === negotiation.negotiation_id)
    .reduce((n, r) => Math.max(n, r.round_no), 0);

  return (
    <div>
      <button className="btn btn-sm mb-4" onClick={onBack}>← negotiations</button>

      <div className="panel p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="display-sm">{deal ? deal.counterparty : negotiation.agreement_id}</div>
            <div className="font-mono caption mt-1">
              {negotiation.agreement_id} · negotiation {negotiation.negotiation_id}
            </div>
          </div>
          <div className="text-right">
            <span className="chip chip-std">
              {negotiation.paper === 'ours' ? 'our paper' : 'their paper'}
            </span>
            <div className="caption mt-1">
              opened {negotiation.opened_on} by {negotiation.opened_by}
            </div>
          </div>
        </div>
      </div>

      <Drift negotiation={negotiation} drift={record.drift.rows} />
      <Rounds negotiation={negotiation} rounds={record.rounds.rows}
              onError={onError} onRecorded={record.reloadAll} canAct={acts} />
      <Positions negotiation={negotiation} positions={record.positions.rows}
                 movements={record.movements.rows} roundNow={roundNow}
                 categories={categories} onError={onError}
                 onChanged={record.reloadAll} acts={acts} />
      <Revivals negotiation={negotiation} revivals={record.revivals.rows} />
      <Concessions negotiation={negotiation} concessions={record.concessions.rows}
                   onError={onError} onChanged={record.reloadAll}
                   approverKind={approverKind} />
    </div>
  );
}

// ── Opening one ───────────────────────────────────────────────────────────
// Two acts, not one act with a switch: opening on fresh paper and opening a
// renewal from last term's executed positions are different commercial
// decisions, and six months later somebody needs to know which happened.
function OpenANegotiation({ deals, negotiations, onError, onOpened }) {
  const [fresh, setFresh] = useState({
    agreement_id: '', paper: 'ours', baseline: 'library_standard',
    renews_agreement_id: '', note: '',
  });
  const [busy, setBusy] = useState(false);

  const already = new Set(negotiations.map((n) => n.agreement_id));
  const available = deals.filter((d) => !already.has(d.agreement_id)
                                     && d.status !== 'executed');
  const renewal = fresh.renews_agreement_id.trim() !== '';

  return (
    <div className="panel p-4 mt-6">
      <PanelHead
        title="Open a negotiation"
        sub="One negotiation per deal. Which positions it starts from is recorded, because starting from last term's compromises is a different act from starting from standard." />

      {available.length === 0
        ? <div className="caption">
            Every deal of yours that could carry a negotiation already has one.
          </div>
        : (
          <>
            <div className="flex gap-2 items-end flex-wrap">
              <div style={{ width: 240 }}>
                <label className="section-label">Deal</label>
                <select className="mt-1.5 w-full font-mono" style={{ padding: '5px 8px' }}
                        data-testid="negotiation-deal"
                        value={fresh.agreement_id}
                        onChange={(e) => setFresh({ ...fresh, agreement_id: e.target.value })}>
                  <option value="">choose…</option>
                  {available.map((d) => (
                    <option key={d.agreement_id} value={d.agreement_id}>
                      {d.agreement_id} — {d.counterparty}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ width: 140 }}>
                <label className="section-label">Whose paper</label>
                <select className="mt-1.5 w-full font-mono" style={{ padding: '5px 8px' }}
                        value={fresh.paper}
                        onChange={(e) => setFresh({ ...fresh, paper: e.target.value })}>
                  <option value="ours">ours</option>
                  <option value="theirs">theirs</option>
                </select>
              </div>
              <div style={{ width: 200 }}>
                <label className="section-label">Starting from</label>
                <select className="mt-1.5 w-full font-mono" style={{ padding: '5px 8px' }}
                        value={fresh.baseline}
                        onChange={(e) => setFresh({ ...fresh, baseline: e.target.value })}>
                  <option value="library_standard">library standard</option>
                  <option value="executed_agreement">last term's positions</option>
                </select>
              </div>
              <div style={{ width: 200 }}>
                <label className="section-label">Renews (optional)</label>
                <input className="mt-1.5 w-full font-mono" style={{ padding: '5px 8px' }}
                       placeholder="AG-001"
                       value={fresh.renews_agreement_id}
                       onChange={(e) => setFresh({ ...fresh, renews_agreement_id: e.target.value })} />
              </div>
            </div>

            <div className="mt-3">
              <label className="section-label">Why this starting point</label>
              <input className="mt-1.5 w-full" value={fresh.note}
                     onChange={(e) => setFresh({ ...fresh, note: e.target.value })} />
            </div>

            <button className="btn btn-primary mt-3" disabled={busy || !fresh.agreement_id}
                    data-testid="open-negotiation"
                    onClick={async () => {
                      setBusy(true); onError(null);
                      const body = renewal
                        ? {
                            agreement_id: fresh.agreement_id,
                            renews_agreement_id: fresh.renews_agreement_id.trim(),
                            paper: fresh.paper,
                            baseline: fresh.baseline,
                            note: fresh.note.trim() || null,
                          }
                        : {
                            agreement_id: fresh.agreement_id,
                            paper: fresh.paper,
                            baseline: fresh.baseline,
                            baseline_note: fresh.note.trim() || null,
                          };
                      const r = renewal ? await API.openRenewal(body)
                                        : await API.openNegotiation(body);
                      setBusy(false);
                      if (!r.ok) { onError(r.reason); return; }
                      setFresh({ agreement_id: '', paper: 'ours',
                                 baseline: 'library_standard',
                                 renews_agreement_id: '', note: '' });
                      onOpened();
                    }}>
              ✓ {renewal ? 'open the renewal' : 'open it'}
            </button>
            <div className="caption mt-2">
              {renewal
                ? 'A renewal seeds its positions from the agreement it renews, and the drift report opens with it.'
                : 'Naming an agreement above turns this into a renewal, which is a different recorded act.'}
            </div>
          </>
        )}
    </div>
  );
}

// ── NG-1 · the requester's negotiate tab ──────────────────────────────────
function NegotiatePane({ me }) {
  const record = useNegotiationRecord();
  const cats  = usePane(() => API.library());
  const [showing, setShowing] = useState(null);
  const [error, setError] = useState(null);

  if (record.loading) return <Loading />;
  if (record.failed) return <LoadFailed reason={record.failed.reason} />;
  const deals = record.deals;

  const categories = categoriesFrom(cats.rows);
  const negotiation = record.negotiations.rows
    .find((n) => String(n.negotiation_id) === String(showing));

  if (showing && negotiation) {
    return (
      <div>
        {error && <RefusalNote reason={error} />}
        <OpenNegotiation
          negotiation={negotiation} record={record} deals={deals.rows}
          categories={categories} onBack={() => setShowing(null)}
          onError={setError} acts approverKind="requester" />
      </div>
    );
  }

  const escalated = record.positions.rows.filter((p) => p.state === 'escalated');

  return (
    <div>
      <TileStrip tiles={[
        { label: 'negotiations open', n: record.negotiations.rows.filter((n) => n.state === 'open').length },
        { label: 'points contested', n: record.positions.rows.filter((p) => !['settled', 'withdrawn'].includes(p.state)).length },
        { label: 'with Legal', n: escalated.length },
      ]} />

      {error && <RefusalNote reason={error} />}

      <div className="mt-6">
        <PanelHead title="My negotiations"
                   sub="Only deals of yours. Nobody else's reaches this browser — the database scopes it, not this screen." />
        <WaitingList
          items={record.negotiations.rows.map((n) => NegotiationRow({
            negotiation: n, deals: deals.rows,
            positions: record.positions.rows, rounds: record.rounds.rows }))}
          onOpen={(it) => setShowing(it.key)}
          empty={<Empty
            kicker="negotiations"
            line="You have nothing under negotiation."
            sub="A negotiation is opened against a deal you already hold. Open one below when the counterparty starts marking up the paper." />}
        />
      </div>

      <OpenANegotiation deals={deals.rows} negotiations={record.negotiations.rows}
                        onError={setError} onOpened={record.reloadAll} />
    </div>
  );
}

// ── NG-2 / NG-3 · the Legal desk ──────────────────────────────────────────
// One pane, held by the Legal reviewer and the Legal admin. Ordered by what is
// waiting on Legal rather than by what is newest: an escalated point is a
// person waiting for an answer.
function NegotiationsDeskPane({ me }) {
  const record = useNegotiationRecord();
  const cats  = usePane(() => API.library());
  const analysis = usePane(() => API.roundAnalysis());
  const risk = usePane(() => API.riskAssessments());
  const [showing, setShowing] = useState(null);
  const [error, setError] = useState(null);

  if (record.loading) return <Loading />;
  if (record.failed) return <LoadFailed reason={record.failed.reason} />;
  const deals = record.deals;

  const categories = categoriesFrom(cats.rows);
  const negotiation = record.negotiations.rows
    .find((n) => String(n.negotiation_id) === String(showing));

  if (showing && negotiation) {
    return (
      <div>
        {error && <RefusalNote reason={error} />}
        <OpenNegotiation
          negotiation={negotiation} record={record} deals={deals.rows}
          categories={categories} onBack={() => setShowing(null)}
          onError={setError} acts approverKind="attorney" />
        <RoundAnalysis negotiation={negotiation}
                       analysis={analysis} risk={risk} />
      </div>
    );
  }

  const escalated = record.positions.rows.filter((p) => p.state === 'escalated');
  const proposed = record.concessions.rows.filter((c) => c.state === 'proposed');

  return (
    <div>
      <TileStrip tiles={[
        { label: 'waiting on Legal', n: escalated.length },
        { label: 'concessions to approve', n: proposed.length },
        { label: 'negotiations open', n: record.negotiations.rows.filter((n) => n.state === 'open').length },
      ]} />

      {error && <RefusalNote reason={error} />}

      <div className="mt-6">
        <PanelHead title="Handed to Legal"
                   sub="Points a requester escalated, oldest first. This is the queue; everything below it is context." />
        {escalated.length === 0
          ? <Empty kicker="escalations"
                   line="Nothing has been handed to Legal."
                   sub="No requester is waiting on a judgement about a negotiating position." />
          : escalated.map((p) => {
              const n = record.negotiations.rows
                .find((x) => x.negotiation_id === p.negotiation_id);
              return (
                <div className="panel-2 p-3 mb-2 flex items-baseline justify-between"
                     key={p.position_id} data-testid="escalated-position">
                  <div>
                    <span className="font-mono text-[12.5px]">{p.category_key}</span>
                    <span className="ml-3 caption">
                      {n ? n.agreement_id : `negotiation ${p.negotiation_id}`}
                      {p.current_rung !== null && p.current_rung !== undefined
                        && ` · at rung ${p.current_rung}`}
                      {' '}· moved round {p.round_last_moved} by {p.moved_by}
                    </span>
                  </div>
                  <button className="btn btn-sm"
                          onClick={() => setShowing(String(p.negotiation_id))}>
                    open
                  </button>
                </div>
              );
            })}
      </div>

      <div className="mt-6">
        <PanelHead title="Every negotiation"
                   sub="All of them, because Legal's read is not scoped to a deal they own." />
        <WaitingList
          items={record.negotiations.rows.map((n) => NegotiationRow({
            negotiation: n, deals: deals.rows,
            positions: record.positions.rows, rounds: record.rounds.rows }))}
          onOpen={(it) => setShowing(it.key)}
          empty={<Empty kicker="negotiations"
                        line="No negotiation is open anywhere."
                        sub="Nothing is being negotiated in the system at all — not a filter, the whole record." />}
        />
      </div>
    </div>
  );
}

// ── Advice on the record ──────────────────────────────────────────────────
// Everything here GATES NOTHING and says so. It is the model's opinion beside
// the position it touched, kept because it was given, not because it decided.
function RoundAnalysis({ negotiation, analysis, risk }) {
  if (analysis.status === 'failed') return null;
  const mine = (analysis.rows ?? [])
    .filter((a) => a.negotiation_id === negotiation.negotiation_id);
  const estimates = risk.rows ?? [];

  return (
    <div className="panel p-4 mt-6" data-testid="round-analysis">
      <PanelHead
        title="Analysis of what they sent"
        sub="Advice on the record. Nothing here moved a position, opened a ticket, or gated anything — and nothing here can." />
      {mine.length === 0
        ? <div className="caption">
            No round of this negotiation has been analysed.
          </div>
        : mine.map((a) => {
            const estimate = estimates.find((e) => e.analysis_id === a.analysis_id);
            return (
              <div className="panel-2 p-3 mb-2" key={a.analysis_id}>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[12.5px]">
                    round {a.round_no} · paragraph {a.paragraph_index}
                  </span>
                  <span className="caption">
                    {a.matched_position
                      ? `matched position ${a.matched_position}`
                      : 'matched no position'}
                    {a.match_score !== null && a.match_score !== undefined
                      && ` · score ${a.match_score}`}
                  </span>
                </div>
                {a.category_key && (
                  <div className="caption mt-1">
                    classified {a.category_key} by {a.classifier}
                    {a.model && ` (${a.model} ${a.model_version || ''})`}
                  </div>
                )}
                {estimate && (
                  <div className="caption mt-1">
                    {/* AN ESTIMATE, LABELLED. An absent outcome carries its
                        recorded reason rather than showing as a blank. */}
                    estimate: {estimate.outcome
                      ? `${estimate.outcome} (${estimate.transfer_estimate})`
                      : `none recorded — ${estimate.absent_reason}`}
                  </div>
                )}
              </div>
            );
          })}
    </div>
  );
}

// ── The shared oddments ───────────────────────────────────────────────────

// The library's categories as {key, label}. A POSITION names the KEY (it is a
// foreign key into cw.category); a MANIFEST names the label. Sending the wrong
// one is refused, and the two are kept apart here rather than at each call.
function categoriesFrom(rows) {
  const seen = new Map();
  for (const row of rows ?? []) {
    if (row.category_key && !seen.has(row.category_key)) {
      seen.set(row.category_key, row.category_label || row.category_key);
    }
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// The database's own sentence, shown where the person acted. Red, because a
// refused act IS an error state for the person who attempted it — unlike a
// refusal to SHOW something, which is the system working.
function RefusalNote({ reason }) {
  return (
    <div className="panel p-3 mt-4" style={{ borderColor: 'var(--danger)' }}>
      <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
      <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{reason}</div>
    </div>
  );
}

// Saving a file is the ONE screen's job, never the transport's — the same
// split GET /runs/contract established, and db/test/shell.test.mjs asserts
// api.jsx contains no createElement('a') precisely so this stays here.
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
