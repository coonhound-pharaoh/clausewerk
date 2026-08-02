// The obligations surfaces — OB-11 (the in-app inbox) and OB-15 (the
// lifecycle surfaces): the waiting-on-you panel, the calendar, the
// per-agreement obligations panel with its envelope strip, and the inbox.
//
// ONE SOURCE, TWO RENDERINGS. The panel renders cw.waiting_on_you — the same
// derivation the notification digest reads — so the screen and the email
// cannot disagree about what is waiting. The inbox renders the outbox record:
// what was actually sent, not what should have been.
//
// ENTITLEMENTS AS PROMINENT AS DUTIES (OA §8): what the counterparty owes us
// renders with the same weight as what we owe them. NOTHING CLOSES SILENTLY:
// the closed states here are recorded acts with a name on them, and the pane
// says who.
//
// The scoping is the database's: a requester's book is their own deals, by the
// obligation table's own policy — nothing here filters or widens.

function WaitingOnYouPanel() {
  const pane = usePane(() => API.waiting());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const KINDS = {
    obligation: 'an obligation is due',
    override_socialisation: 'an override was socialised to you',
    renewal_window: 'a renewal window is open',
    envelope_out: 'an envelope is out for signature',
    countersign: 'a role grant waits on your countersign',
    review_ticket: 'a ticket waits for review',
    review_escalation: 'an unclaimed ticket escalated to you',
  };

  return (
    <div>
      <PanelHead title="Waiting on you"
                 sub="The same derivation the notification digest reads — screen and email cannot disagree." />
      {pane.rows.length === 0 ? (
        <Empty kicker="waiting" line="Nothing is waiting on you."
               sub="When something is — a due obligation, a socialised override, a
                    renewal window — it appears here and in the digest, from one
                    derivation." />
      ) : (
        <div className="panel">
          {pane.rows.map((w, i) => (
            <div className="waiting-row" key={`${w.kind}-${w.subject_ref}-${i}`}>
              <div className="min-w-0">
                <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  {KINDS[w.kind] ?? w.kind}
                  <span className="caption"> · {w.subject_ref}</span>
                </div>
              </div>
              <span className="caption shrink-0">
                {w.due_on ? `due ${w.due_on}` : (w.since ? `since ${String(w.since).slice(0, 10)}` : '')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── The calendar: obligations and entitlements over time ──────────────────
function ObligationCalendar({ rows }) {
  // Grouped by due month; the unanchored (no due date) get their own honest
  // bucket rather than disappearing — a termination-anchored duty with no
  // termination date yet is a fact, not a blank.
  const months = new Map();
  const undated = [];
  for (const o of rows) {
    if (!o.due_on) { undated.push(o); continue; }
    const m = String(o.due_on).slice(0, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(o);
  }
  const ordered = [...months.keys()].sort();

  return (
    <div className="mt-6">
      <PanelHead title="The calendar"
                 sub="Duties and entitlements over time, from the recorded book." />
      {ordered.length === 0 && undated.length === 0 ? (
        <Empty kicker="calendar" line="No obligation is on the book." />
      ) : (
        <>
          {ordered.map((m) => (
            <div className="panel p-3 mb-3" key={m} data-testid="calendar-month">
              <div className="section-label">{m}</div>
              {months.get(m).map((o) => <ObligationLine o={o} key={o.obligation_id} />)}
            </div>
          ))}
          {undated.length > 0 && (
            <div className="panel p-3 mb-3" data-testid="calendar-unanchored">
              <div className="section-label">no date yet</div>
              <div className="caption mt-1">
                Anchored to an event that has not happened — a termination date,
                usually. Visible here rather than invented or hidden.
              </div>
              {undated.map((o) => <ObligationLine o={o} key={o.obligation_id} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ObligationLine({ o }) {
  return (
    <div className="flex gap-3 items-center mt-1.5" data-testid="obligation-line">
      <span className="text-[13px] min-w-0 truncate" style={{ color: 'var(--ink)' }}>
        {o.summary}
        <span className="caption"> · {o.agreement_id} · {o.clause_id}@v{o.version}
          {o.occurrence > 0 ? ` · #${o.occurrence}` : ''}</span>
      </span>
      <span className="flex gap-2 items-center shrink-0 ml-auto">
        {/* An entitlement — the counterparty owes US — carries the same weight
            as a duty, deliberately (OA §8). */}
        {o.entitlement
          ? <span className="chip chip-std" data-testid="entitlement">owed to us</span>
          : <span className="caption">ours · {o.owner_person ?? 'UNOWNED'}</span>}
        {o.due_on && <span className="caption">{o.due_on}</span>}
        <span className={`chip ${o.state === 'overdue' ? 'chip-err'
          : o.state === 'due' ? 'chip-pending'
          : o.closed_as ? 'chip-std' : 'chip-ok'}`}>
          {o.closed_as ? `${o.closed_as} by ${o.closed_by}` : o.state}
        </span>
      </span>
    </div>
  );
}

// ── Per-agreement panel, envelope strip beside it ─────────────────────────
function AgreementObligations({ rows, envelopes }) {
  const byDeal = new Map();
  for (const o of rows) {
    if (!byDeal.has(o.agreement_id)) byDeal.set(o.agreement_id, []);
    byDeal.get(o.agreement_id).push(o);
  }

  return (
    <div className="mt-6">
      <PanelHead title="By agreement"
                 sub="Each deal's duties with the wording that created them adjacent, and its envelopes." />
      {[...byDeal.keys()].sort().map((ag) => {
        const envs = (envelopes ?? []).filter((e) => e.agreement_id === ag);
        return (
          <div className="panel p-3 mb-3" key={ag} data-testid="agreement-obligations">
            <div className="section-label">{ag}</div>
            {envs.length > 0 && (
              <div className="flex gap-2 mt-1.5" data-testid="envelope-strip">
                {envs.map((e) => (
                  <span key={e.envelope_id}
                        className={`chip ${e.state === 'completed' ? 'chip-ok'
                          : e.state === 'sent' ? 'chip-pending' : 'chip-err'}`}>
                    envelope · {e.provider} · {e.state}
                  </span>
                ))}
              </div>
            )}
            {byDeal.get(ag).map((o) => <ObligationLine o={o} key={o.obligation_id} />)}
          </div>
        );
      })}
    </div>
  );
}

// ── The inbox: what was actually sent (OB-11) ─────────────────────────────
function NotificationInbox() {
  const pane = usePane(() => API.outbox());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  return (
    <div className="mt-6">
      <PanelHead title="Inbox"
                 sub="What was actually sent — the delivery record, not the intention." />
      {pane.rows.length === 0 ? (
        <Empty kicker="inbox" line="Nothing has been sent."
               sub="Deliveries are recorded here as facts once they happen; a row
                    that never appears is itself the honest answer." />
      ) : (
        <div className="panel">
          {pane.rows.map((n, i) => (
            <div className="waiting-row" key={i}>
              <div className="min-w-0">
                <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  {n.kind ?? 'digest'}
                  <span className="caption"> · to {n.person}
                    {n.channel ? ` · ${n.channel}` : ''}</span>
                </div>
                {n.subject_refs && (
                  <div className="caption mt-0.5">{String(n.subject_refs)}</div>
                )}
              </div>
              <span className="caption shrink-0">
                {n.sent_on ?? (n.sent_at ? String(n.sent_at).slice(0, 10) : '')}
                {n.outcome ? ` · ${n.outcome}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── The pane the tab renders ──────────────────────────────────────────────
function ObligationsPane() {
  const book = usePane(() => API.obligationsBook());
  const envelopes = usePane(() => API.envelopes());
  const gaps = usePane(() => API.obligationGaps());

  if (book.status === 'loading') return <Loading />;
  if (book.status === 'failed') return <LoadFailed reason={book.reason} />;

  return (
    <div>
      <WaitingOnYouPanel />
      <ObligationCalendar rows={book.rows} />
      <AgreementObligations rows={book.rows}
        envelopes={envelopes.status === 'loaded' ? envelopes.rows : []} />
      {gaps.status === 'loaded' && gaps.rows.length > 0 && (
        // A clause in force declaring no obligations — reported, not guessed
        // at, and never a defect in development (content is placeholder).
        <div className="caption mt-4" data-testid="obligation-gaps">
          {gaps.rows.length} in-force clause{gaps.rows.length === 1 ? ' declares' : 's declare'}
          {' '}no obligations: {gaps.rows.map((g) => `${g.clause_id}@v${g.version}`).join(' · ')}.
          Declaring them is Legal's, through obligation templates — the system's
          part is showing the gap here.
        </div>
      )}
      <NotificationInbox />
    </div>
  );
}
