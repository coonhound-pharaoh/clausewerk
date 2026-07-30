// Reporting (RP-01…RP-04), routing (RP-02) and the friction scorecard (RP-03).
//
// Three panes, three audiences:
//
//   · ReportingPane — legal admin and the auditor. Renders what the report
//     views answer; every figure is derived server-side, fresh, and nothing
//     here computes a number the database did not.
//   · RoutePane — the review desk's routing board: who holds each pending
//     ticket, who owns its category, and which tickets escalated because
//     nobody took them. Claiming and releasing are the two acts.
//   · FrictionPane — the vendor scorecard, readable by a requester at intake
//     ON PURPOSE. The cost column is an estimate and the ROW says so; this
//     pane renders that label rather than re-deciding it.
//
// The rule of every pane in this shell holds: a refusal renders as the
// database's own sentence, never as an empty list.

function ReportingPane() {
  const queue = usePane(() => API.reportQueue());
  const velocity = usePane(() => API.reportVelocity());
  const contested = usePane(() => API.reportContested());
  const reviewers = usePane(() => API.reportReviewers());
  const exposure = usePane(() => API.reportExposure());
  const shift = usePane(() => API.reportPolicyShift());

  if (queue.status === 'loading') return <Loading />;
  if (queue.status === 'failed') return <LoadFailed reason={queue.reason} />;

  const q = queue.rows[0] ?? {};
  const executed = velocity.rows.filter((r) => r.executed_on != null);
  const signedDays = executed
    .map((r) => Number(r.days_open_to_signature))
    .filter((n) => Number.isFinite(n));
  const meanCycle = signedDays.length
    ? Math.round(signedDays.reduce((a, b) => a + b, 0) / signedDays.length)
    : null;

  return (
    <div>
      <PanelHead
        title="Reporting"
        sub="Derived fresh from the record on every load — there is no report store to go stale." />

      <TileStrip tiles={[
        { label: 'tickets pending', n: Number(q.pending ?? 0) },
        { label: 'pending over a week', n: Number(q.pending_over_week ?? 0) },
        {
          label: meanCycle === null
            ? 'mean days open → signature — nothing signed yet'
            : `mean days open → signature · ${signedDays.length} signed`,
          n: meanCycle === null ? '—' : meanCycle,
        },
      ]} />

      <div className="mt-5">
        <PanelHead title="Most contested categories"
          sub="Escalations, supplier pushback and conceded positions, by category. A high count says a standard position generates argument — what to do about the words is Legal's." />
        {contested.status === 'failed' ? <LoadFailed reason={contested.reason} /> :
          <WaitingList
            items={contested.rows
              .filter((r) => Number(r.contests) > 0)
              .map((r) => ({
                key: r.category_key,
                title: `${r.label} — ${Number(r.contests)} contests`,
                sub: `${Number(r.tickets_escalated)} escalated · `
                   + `${Number(r.tickets_supplier_paper)} supplier paper · `
                   + `${Number(r.positions_conceded)} of ${Number(r.positions_opened)} positions conceded`,
                at: null,
              }))}
            empty={<Empty kicker="contested"
              line="No category has generated a contest yet." />}
          />}
      </div>

      <div className="mt-5">
        <PanelHead title="Reviewer throughput"
          sub="A workload signal for staffing, never a performance score — the mean hides the hard tickets." />
        {reviewers.status === 'failed' ? <LoadFailed reason={reviewers.reason} /> :
          <WaitingList
            items={reviewers.rows.map((r) => ({
              key: r.reviewer,
              title: `${r.reviewer} — ${Number(r.decided)} decided`,
              sub: `${Number(r.verified)} verified · ${Number(r.rejected)} rejected · `
                 + `${r.mean_hours_to_decision ?? '—'} mean hours to decision`,
              at: null,
            }))}
            empty={<Empty kicker="throughput"
              line="Nobody has decided a ticket yet." />}
          />}
      </div>

      <div className="mt-5">
        <PanelHead title="Risk exposure — live portfolio"
          sub="Executed, still-active agreements by category and the severity their run recorded — the record, not today's library." />
        {exposure.status === 'failed' ? <LoadFailed reason={exposure.reason} /> :
          <WaitingList
            items={exposure.rows.map((r) => ({
              key: `${r.category_key}-${r.severity}`,
              title: `${r.label} · ${r.severity}`,
              sub: `${Number(r.active_agreements)} active agreement${Number(r.active_agreements) === 1 ? '' : 's'}`,
              at: null,
              chips: <span className={`chip ${r.severity === 'High' ? 'chip-pending' : 'chip-std'}`}>
                {r.severity}
              </span>,
            }))}
            empty={<Empty kicker="exposure"
              line="No executed agreement is currently active." />}
          />}
      </div>

      <div className="mt-5">
        <PanelHead title="Policy shift — the amendment worklist"
          sub="Live agreements measured against the CURRENT library: superseded versions and missing always-include categories. The worklist a campaign starts from — never the amendments themselves." />
        {shift.status === 'failed' ? <LoadFailed reason={shift.reason} /> :
          <WaitingList
            items={shift.rows.map((r) => ({
              key: `${r.agreement_id}-${r.clause_id}`,
              title: `${r.agreement_id} · ${r.counterparty} — ${r.clause_id}`,
              sub: r.exposure === 'outdated'
                ? `carries v${r.executed_version}; the library is at v${r.current_version}`
                : `always-include category absent from the executed run`,
              at: null,
              chips: <span className={`chip ${r.exposure === 'missing' ? 'chip-pending' : 'chip-std'}`}>
                {r.exposure}
              </span>,
            }))}
            empty={<Empty kicker="policy shift"
              line="Every live agreement matches the current library." />}
          />}
      </div>
    </div>
  );
}

function RoutePane({ me }) {
  const pane = usePane(() => API.ticketRoute());
  const [acting, setActing] = useState(null);
  const [refused, setRefused] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const act = async (fn, ticketId) => {
    setActing(ticketId); setRefused(null);
    const r = await fn({ ticket_id: ticketId });
    setActing(null);
    if (!r.ok) setRefused(r.reason);
    pane.reload();
  };

  return (
    <div>
      <PanelHead
        title="Routing"
        sub="Every pending ticket: who holds it, who owns its category, and what nobody took. The owner comes from the ladder at read time — reassign a ladder and every open ticket reroutes at once." />

      {refused && <Refused what="That claim was refused." reason={refused} />}

      <WaitingList
        items={pane.rows.map((r) => ({
          key: r.ticket_id,
          title: `Ticket ${r.ticket_id} · ${r.category_key} · ${r.severity}`,
          sub: r.claimed_by
            ? `claimed by ${r.claimed_by}`
            : `unclaimed · category owner ${r.category_owner ?? '— no ladder names one'}`,
          at: r.created_at,
          chips: (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {r.escalated && <span className="chip chip-pending">escalated to owner</span>}
              {r.claimed_by === me.person
                ? <button className="btn btn-sm" disabled={acting === r.ticket_id}
                    onClick={() => act(API.releaseClaim, r.ticket_id)}>release</button>
                : !r.claimed_by &&
                  <button className="btn btn-sm" disabled={acting === r.ticket_id}
                    onClick={() => act(API.claimTicket, r.ticket_id)}>claim</button>}
            </span>
          ),
        }))}
        empty={<Empty kicker="routing"
          line="Nothing is pending — an empty queue, not a failed read." />}
      />

      <p className="caption mt-3">
        Claiming says <em>I am looking at this</em> — it is coordination, not
        adjudication, and a colleague can release an absent colleague's claim.
        A ticket unclaimed past the escalation window appears on its category
        owner's own waiting list until somebody takes it.
      </p>
    </div>
  );
}

function FrictionPane() {
  const pane = usePane(() => API.vendorFriction());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  return (
    <div>
      <PanelHead
        title="Vendor friction"
        sub="What negotiating with each counterparty has historically cost — checked before committing to one, not discovered after." />

      <WaitingList
        items={pane.rows.map((r) => ({
          key: r.counterparty,
          title: `${r.counterparty} — ${r.friction_per_deal} friction per deal`,
          sub: `${Number(r.deals)} deals (${Number(r.executed)} signed) · `
             + `${Number(r.rounds_received)} redline rounds · `
             + `${Number(r.positions_escalated)} escalations · `
             + `${Number(r.supplier_paper_tickets)} supplier-paper tickets`,
          at: null,
          chips: (
            <span className="chip chip-std" title={r.cost_is}>
              ≈ ${Number(r.estimated_handling_cost_usd).toLocaleString()} estimated
            </span>
          ),
        }))}
        empty={<Empty kicker="vendor friction"
          line="No counterparty history yet — the first deal writes the first row." />}
      />

      <p className="caption mt-3">
        The counts are measured from the record. <strong>The dollar figure is an
        estimate</strong> — it multiplies those counts by hours-and-rate
        assumptions the Administrator maintains as visible settings, and the row
        itself says so. Names group verbatim: a misspelled vendor is two rows,
        which is the incentive to type names consistently.
      </p>
    </div>
  );
}
