// The Legal reviewer's workspace (WP-U11).
//
// The review desk: everything waiting on Legal judgement, oldest first.
//
// THREE RULES THIS SCREEN HAS TO GET RIGHT, and two of them are the difference
// between a review and a rubber stamp:
//
//   1. THE AI CANDIDATE IS NEVER PRE-FILLED INTO THE APPROVAL BOX. The reviewer
//      chooses; the screen must not have chosen already. A box arriving with the
//      proposal in it turns "approve" into "confirm", and the
//      unedited-approval-rate measurement exists precisely to watch that
//      pressure — a screen that creates it is measuring its own defect.
//
//   2. VERIFY SHOWS WHAT WILL BE MINTED, BEFORE IT IS MINTED. The wording
//      approved is the wording that exists forever, and a clause version is
//      immutable the moment it lands. There is no undo to fall back on.
//
//   3. THE OLDEST WAIT IS VISIBLE. Sort order is a control here, not a
//      preference: the desk exists to surface the longest wait, and a
//      newest-first list buries exactly what it was built to show.

const { useState } = React;

// Provenance badges travel with the text, so a reviewer always knows whose words
// they are reading (ADR-0003). Rendered in the established chip idiom, and
// deliberately NOT colour-coded by severity — red means error, never
// classification.
function ProvenanceBadge({ badge }) {
  return <span className="chip chip-std" title="whose words these are">{badge}</span>;
}

// ── Adjudicating a ticket ────────────────────────────────────────────────
function TicketDesk({ ticket, onDone, onError, onClose }) {
  // EMPTY. Not `useState(ticket.proposed_text)`.
  //
  // This single line is the rule. Pre-filling would make the proposal the
  // default outcome, and the measured unedited-approval rate would then be
  // measuring the form's design rather than Legal's judgement.
  const [approved, setApproved] = useState('');
  const [clauseId, setClauseId] = useState('');
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const edited = approved.trim() !== ticket.proposed_text.trim();
  const ready = approved.trim() && clauseId.trim() && title.trim() && rationale.trim();

  if (confirming) {
    return (
      <div className="panel p-4 mt-4" style={{ borderColor: 'var(--accent)' }}>
        <PanelHead
          title="This is what will be minted"
          sub="A clause version cannot be edited once it exists. Read it before you agree."
        />
        {/* The paper surface, because this is contract language. */}
        <div className="paper p-5 mt-2" style={{ color: '#1A1714' }}>
          <div className="font-mono" style={{ fontSize: 11, letterSpacing: '.06em' }}>
            {clauseId.trim()} · v1 · {title.trim()}
          </div>
          <div className="font-serif mt-3" style={{ fontSize: 16, lineHeight: 1.6 }}>
            {approved.trim()}
          </div>
        </div>

        <div className="mt-3 caption" style={{ lineHeight: 1.7 }}>
          Approved by you, on the record, permanently. The origin is{' '}
          <strong>derived from where this text came from</strong> — you do not
          choose it, and it cannot be changed afterwards.
          {edited
            ? <> This text <strong>differs</strong> from what was proposed, so it
                will be recorded as edited before approval.</>
            : <> This is the proposed text unchanged, so it will be recorded as
                approved without edit — which is the figure Legal watches.</>}
        </div>

        <div className="flex gap-2 mt-4">
          <button className="btn" onClick={() => setConfirming(false)}>← back</button>
          <button
            className="btn btn-primary" disabled={busy}
            data-testid="confirm-verify"
            onClick={async () => {
              setBusy(true); onError(null);
              const r = await API.verifyTicket({
                ticket_id: ticket.ticket_id,
                approved_text: approved.trim(),
                new_clause_id: clauseId.trim(),
                title: title.trim(),
                rationale: rationale.trim(),
                note: note.trim() || null,
              });
              setBusy(false);
              if (!r.ok) { onError(r.reason); setConfirming(false); return; }
              onDone();
            }}
          >{busy ? 'minting…' : '✓ mint this wording'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-4 mt-4">
      <div className="flex items-start justify-between">
        <div>
          <PanelHead
            title={`Ticket ${ticket.ticket_id}`}
            sub={`${ticket.category_key} · ${ticket.severity} · ${ticket.reason_code}`}
          />
        </div>
        <button className="btn btn-sm" onClick={onClose}>close</button>
      </div>

      {/* What is being proposed, badged, and quarantined. This text is not
          selectable by anything and cannot reach a contract from here. */}
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-2">
          <ProvenanceBadge badge={ticket.provenance_badge} />
          <span className="caption">opened by {ticket.opened_by}</span>
        </div>
        <div className="panel-2 p-3">
          <div className="font-serif" style={{ fontSize: 15, lineHeight: 1.6 }}>
            {ticket.proposed_text}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className="section-label">The wording you approve</label>
        <textarea
          className="mt-1.5 w-full font-serif" rows={4}
          data-testid="approved-text"
          placeholder="Type or paste the wording you are approving."
          value={approved} onChange={(e) => setApproved(e.target.value)}
        />
        {/* Said out loud, because an empty box looks like an oversight until
            somebody explains that it is the point. */}
        <div className="caption mt-1.5" style={{ lineHeight: 1.6 }}>
          Deliberately empty. Copying the proposal in is one keystroke; having it
          already there would make it the default, and the rate at which proposed
          wording is approved unchanged is a figure Legal watches.
          {approved.trim() && (
            edited
              ? <> <span style={{ color: 'var(--accent-2)' }}>This differs from the proposal.</span></>
              : <> <span style={{ color: 'var(--mute)' }}>This matches the proposal exactly.</span></>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label className="section-label">New clause id</label>
          <input className="mt-1.5 w-full font-mono" placeholder="DP-H-020"
                 value={clauseId} onChange={(e) => setClauseId(e.target.value)} />
        </div>
        <div>
          <label className="section-label">Title</label>
          <input className="mt-1.5 w-full" placeholder="72-hour notification"
                 value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>

      <div className="mt-3">
        <label className="section-label">Rationale</label>
        <input className="mt-1.5 w-full" placeholder="Why this wording is acceptable"
               value={rationale} onChange={(e) => setRationale(e.target.value)} />
      </div>

      <div className="mt-3">
        <label className="section-label">Note (optional on approval, required on rejection)</label>
        <input className="mt-1.5 w-full" value={note}
               onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex gap-2 mt-4">
        {/* Verify goes through a confirmation. Reject does not need one: it
            mints nothing and is reversible by opening a new ticket. Friction
            belongs where the irreversibility is. */}
        <button className="btn btn-primary" disabled={!ready}
                data-testid="verify"
                onClick={() => setConfirming(true)}>
          ✓ verify…
        </button>
        <button className="btn" disabled={busy || !note.trim()}
                data-testid="reject"
                onClick={async () => {
                  setBusy(true); onError(null);
                  const r = await API.rejectTicket({
                    ticket_id: ticket.ticket_id, note: note.trim(),
                  });
                  setBusy(false);
                  if (!r.ok) { onError(r.reason); return; }
                  onDone();
                }}>
          ✕ reject
        </button>
        {!note.trim() && (
          <span className="caption self-center">A rejection needs a note.</span>
        )}
      </div>
    </div>
  );
}

// ── The override decision surface ────────────────────────────────────────
// PER FINDING. There is no "approve all" button here, and adding one would not
// merely be a shortcut — the deciding person would not have seen each finding,
// which is the entire reason the workflow is per-finding.
function OverrideDecisions({ me, onError }) {
  const requests = usePane(() => API.overrides());
  const findings = usePane(() => API.overrideFindings());
  const notified = usePane(() => API.overrideNotified());
  const [note, setNote] = useState({});

  if (requests.status === 'loading') return <Loading />;
  if (requests.status === 'failed') return <LoadFailed reason={requests.reason} />;
  // The findings and the socialisation list are checked too, and this is not
  // belt-and-braces. `(findings.rows ?? [])` turns a FAILED read into an empty
  // list, so a request would render "Each finding, decided on its own" with
  // nothing under it — "we could not ask" wearing the clothes of "there is
  // nothing here", on the one screen where the whole point is deciding each
  // finding. A refusal is not an empty list, here as everywhere.
  if (findings.status === 'failed') return <LoadFailed reason={findings.reason} />;
  if (notified.status === 'failed') return <LoadFailed reason={notified.reason} />;
  if (findings.status === 'loading' || notified.status === 'loading') return <Loading />;

  const open = requests.rows.filter((r) => r.state === 'socialised');
  const reload = () => { requests.reload(); findings.reload(); notified.reload(); };

  if (open.length === 0) {
    return <Empty
      kicker="override requests"
      line="Nothing is waiting on an override decision."
      sub="A request appears here once it has been socialised to its watchers. Nothing can be decided before that, or before its review window closes." />;
  }

  return (
    <div>
      {open.map((r) => {
        const mine = (findings.rows ?? []).filter((f) => f.request_id === r.request_id);
        const told = (notified.rows ?? []).filter((n) => n.request_id === r.request_id);
        return (
          <div className="panel p-4 mb-4" key={r.request_id}>
            <PanelHead
              title={`Request ${r.request_id} · ${r.agreement_id ?? 'no deal'}`}
              sub={`asked for by ${r.requested_by}`}
              right={r.window_closed
                ? <span className="chip chip-ok">window closed</span>
                // The window state is visible, always. A reviewer who cannot see
                // it would try, be refused, and learn the rule from an error.
                : <span className="chip chip-pending" title={r.window_closes}>
                    window open until {new Date(r.window_closes).toLocaleString()}
                  </span>}
            />

            {/* The justification, in the established idiom: oversized teal
                quotation marks around every human justification. */}
            <div className="panel-2 p-3 mt-1 relative">
              <span className="font-serif" style={{
                position: 'absolute', left: 6, top: -6, fontSize: 34,
                color: 'var(--accent)', opacity: .55, lineHeight: 1 }}>“</span>
              <div className="font-serif italic" style={{
                fontSize: 15, lineHeight: 1.6, paddingLeft: 22 }}>
                {r.justification}
              </div>
              {r.commercial_pressure && (
                <div className="caption mt-2" style={{ paddingLeft: 22 }}>
                  Commercial pressure cited: {r.commercial_pressure}
                </div>
              )}
            </div>

            <div className="caption mt-2">
              Socialised to {told.length} {told.length === 1 ? 'person' : 'people'}
              {told.length > 0 && <> — {told.map((t) => `${t.person} (${t.reason})`).join(', ')}</>}
            </div>

            <div className="mt-4">
              <div className="section-label mb-2">Each finding, decided on its own</div>
              {mine.map((f) => (
                <div className="panel-2 p-3 mb-2" key={f.finding_ref}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--mute-2)' }}>
                        {f.finding_ref}
                      </div>
                      <div className="text-[13px] mt-1" style={{ color: 'var(--ink)' }}>
                        {f.summary}
                      </div>
                    </div>
                    <span className={`chip ${f.severity === 'High' ? 'chip-high' : 'chip-std'}`}>
                      {f.severity}
                    </span>
                  </div>

                  {f.decision ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`chip ${f.decision === 'approved' ? 'chip-ok' : 'chip-err'}`}>
                        {f.decision}
                      </span>
                      <span className="caption">
                        by {f.decided_by}{f.note ? ` — ${f.note}` : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-3 items-center">
                      <input
                        className="flex-1" style={{ padding: '4px 8px' }}
                        placeholder="note (required to reject)"
                        value={note[f.finding_ref] ?? ''}
                        onChange={(e) => setNote({ ...note, [f.finding_ref]: e.target.value })}
                      />
                      <button
                        className="btn btn-sm" disabled={!r.window_closed}
                        data-testid={`approve-${f.finding_ref}`}
                        onClick={async () => {
                          onError(null);
                          const x = await API.decideOverride({
                            request_id: r.request_id, finding_ref: f.finding_ref,
                            decision: 'approved', note: note[f.finding_ref] || null,
                          });
                          if (!x.ok) onError(x.reason); else reload();
                        }}
                      >✓ approve this finding</button>
                      <button
                        className="btn btn-sm"
                        disabled={!r.window_closed || !(note[f.finding_ref] ?? '').trim()}
                        onClick={async () => {
                          onError(null);
                          const x = await API.decideOverride({
                            request_id: r.request_id, finding_ref: f.finding_ref,
                            decision: 'rejected', note: note[f.finding_ref].trim(),
                          });
                          if (!x.ok) onError(x.reason); else reload();
                        }}
                      >✕ reject</button>
                    </div>
                  )}
                </div>
              ))}
              {/* No approve-all. Deliberately, and said so, because its absence
                  looks like an omission to anybody who has not read ADR-0008. */}
              <div className="caption mt-2">
                Each finding is decided on its own. There is no approve-all —
                accepting a governing-law conflict does not accept an uncapped
                indemnity, and one button for both would mean nobody looked at
                the second.
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── The desk ─────────────────────────────────────────────────────────────
function ReviewDeskPane({ me }) {
  const tickets = usePane(() => API.waitingTickets());
  const queue   = usePane(() => API.countersignQueue());
  const overrides = usePane(() => API.overrides());
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  if (tickets.status === 'loading') return <Loading />;
  if (tickets.status === 'failed') return <LoadFailed reason={tickets.reason} />;

  const waitingOverrides = (overrides.rows ?? []).filter((r) => r.state === 'socialised');
  const full = open && tickets.rows.find((t) => t.ticket_id === open);

  return (
    <div>
      <TileStrip tiles={[
        { label: 'tickets waiting', n: tickets.rows.length },
        { label: 'override decisions', n: overrides.status === 'loaded' ? waitingOverrides.length : null },
        { label: 'grants to countersign', n: queue.status === 'loaded' ? queue.rows.length : null },
      ]} />

      {error && (
        <div className="panel p-3 mt-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      <div className="mt-6">
        <PanelHead
          title="Waiting on Legal"
          sub="Oldest first. The longest wait is the one this desk exists to show."
        />
        <WaitingList
          items={tickets.rows.map((t) => ({
            key: t.ticket_id,
            title: `${t.category_key} · ${t.severity}`,
            sub: `${t.reason_code} · opened by ${t.opened_by}`,
            at: t.created_at,
            chips: <ProvenanceBadge badge={t.provenance_badge} />,
          }))}
          onOpen={(it) => setOpen(it.key)}
          empty={<Empty
            kicker="review desk"
            line="Nothing is waiting on Legal."
            sub="Tickets, override decisions, concession approvals and holds all land here, oldest first." />}
        />
      </div>

      {full && (
        <TicketDesk
          ticket={full}
          onClose={() => setOpen(null)}
          onError={setError}
          onDone={() => { setOpen(null); tickets.reload(); }}
        />
      )}

      {queue.status === 'loaded' && queue.rows.length > 0 && (
        <div className="mt-8">
          <CountersignQueue
            me={me} rows={queue.rows}
            onDone={() => queue.reload()} onError={setError}
          />
        </div>
      )}
    </div>
  );
}

function OverridesPane({ me }) {
  const [error, setError] = useState(null);
  return (
    <div>
      {error && (
        <div className="panel p-3 mb-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}
      <PanelHead
        title="Override decisions"
        sub="Each finding on its own. Nothing can be decided before its window closes."
      />
      <OverrideDecisions me={me} onError={setError} />
    </div>
  );
}

// Tickets pane — the whole queue including decided ones, so a reviewer can see
// what they and their colleagues have done.
function TicketsPane({ me }) {
  const pane = usePane(() => API.tickets());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;
  return (
    <div>
      <PanelHead
        title="Every ticket"
        sub="Pending and decided. What was approved, by whom, and whether it was edited first."
      />
      <WaitingList
        items={pane.rows.map((t) => ({
          key: t.ticket_id,
          title: `${t.category_key} · ${t.severity}`,
          sub: t.state === 'pending'
            ? `${t.reason_code} · opened by ${t.opened_by}`
            : `${t.decided_by} · ${t.minted_clause_id
                ? `minted ${t.minted_clause_id}@v${t.minted_version}` : 'nothing minted'}`,
          at: t.created_at,
          chips: (
            <>
              <ProvenanceBadge badge={t.provenance_badge} />
              {t.state === 'pending'
                ? <span className="chip chip-pending">pending</span>
                : t.state === 'verified'
                  ? <span className="chip chip-ok">verified</span>
                  : <span className="chip chip-err">{t.state}</span>}
              {/* DERIVED, never chosen. The badge exists because the fact does,
                  not because anybody ticked a box. */}
              {t.edited_before_approval === true &&
                <span className="chip chip-std" title="the approved wording differed from what was proposed">
                  edited first
                </span>}
              {t.edited_before_approval === false &&
                <span className="chip chip-std" title="approved exactly as proposed">
                  unedited
                </span>}
            </>
          ),
        }))}
        empty={<Empty kicker="tickets" line="No tickets have been opened." />}
      />
    </div>
  );
}

// ── Holds ────────────────────────────────────────────────────────────────
// Opening a hold is a reviewer's act; RELEASING one is legal admin's, and this
// pane does not offer it. A greyed-out release button would be the read-only
// editor the guides refuse elsewhere — a reviewer simply does not have that act,
// and the screen should say so in words rather than in a disabled control.
function HoldsPane({ me }) {
  const pane = usePane(() => API.holds());
  const deals = usePane(() => API.deals());
  const [error, setError] = useState(null);
  const [agreement, setAgreement] = useState('');
  const [matter, setMatter] = useState('');

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  return (
    <div>
      {error && (
        <div className="panel p-3 mb-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      <PanelHead
        title="Legal holds"
        sub="While a hold is open, nothing about that agreement is destroyed, however far past its retention date."
      />
      <WaitingList
        items={pane.rows.map((h) => ({
          key: h.hold_id,
          title: `${h.agreement_id} · ${h.matter_ref}`,
          sub: `opened by ${h.opened_by}${h.released_on ? ` · released by ${h.released_by}` : ''}`,
          at: h.opened_on,
          chips: h.released_on
            ? <span className="chip chip-std">released</span>
            : <span className="chip chip-high">open</span>,
        }))}
        empty={<Empty kicker="holds" line="No holds are open."
                      sub="A hold stops the retention clock for a dispute." />}
      />

      <div className="panel p-4 mt-6">
        <PanelHead title="Open a hold" sub="Name the matter. It is what the retention monitor will show." />
        <div className="flex gap-2 items-end">
          <div style={{ width: 220 }}>
            <label className="section-label">Agreement</label>
            <select className="mt-1.5 w-full font-mono" value={agreement}
                    onChange={(e) => setAgreement(e.target.value)}>
              <option value="">choose a deal</option>
              {(deals.rows ?? []).map((d) => (
                <option key={d.agreement_id} value={d.agreement_id}>{d.agreement_id}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 240 }}>
            <label className="section-label">Matter</label>
            <input className="mt-1.5 w-full" placeholder="LIT-2026-014"
                   value={matter} onChange={(e) => setMatter(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={!agreement || !matter.trim()}
                  onClick={async () => {
                    setError(null);
                    const r = await API.openHold({
                      agreement_id: agreement, matter_ref: matter.trim(),
                    });
                    if (!r.ok) { setError(r.reason); return; }
                    setMatter(''); pane.reload();
                  }}>✓ open hold</button>
        </div>
      </div>

      <div className="caption mt-4">
        Releasing a hold is a Legal admin's act, not a reviewer's — so there is
        no release button here rather than a greyed-out one. A disabled control
        would say "you could, but not now"; the truth is that this is somebody
        else's decision.
      </div>
    </div>
  );
}
