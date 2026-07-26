// The six workspaces.
//
// WP-U07 builds the SHELL: every workspace opens on what is waiting, the
// requester's deal list works with the pipeline rail as an open deal's header,
// and every remaining pane renders an honest empty state naming the package it
// lands in. The detailed panes arrive in WP-U08 through WP-U14.
//
// The rule for this file: a pane either reads a real endpoint or says it is not
// built. There is no third option, and in particular there are no example rows.
// The v4 concept mockup has a complete set of invented data and none of it is
// imported here.

const { useState } = React;

// ── The pipeline rail, per deal ──────────────────────────────────────────
// v3 drew this as one global state, so two deals at two stages shared a rail and
// the screen could only be telling the truth about one of them. Under decision
// U8 it is the header of an OPEN DEAL and takes its stage from that deal.
const STAGES = ['Intake', 'Manifest', 'Forge', 'Validate', 'Dossier'];

// Which stage a deal has reached, derived from its recorded status rather than
// held anywhere. A stored stage is a fact that starts drifting the moment
// anything else changes.
function stageOf(deal) {
  if (deal.status === 'executed') return STAGES.length;      // past the end
  if (deal.status === 'negotiating') return 3;               // Validate
  return 1;                                                  // Manifest
}

function PipelineRail({ deal }) {
  const at = stageOf(deal);
  return (
    <div className="pipe" data-testid="pipeline-rail" data-deal={deal.agreement_id}>
      {STAGES.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <div className="pipe-sep" />}
          <div className={`pipe-stage${i < at ? ' done' : ''}${i === at ? ' here' : ''}`}>
            <span className="pipe-dot" />
            {s}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Requester ────────────────────────────────────────────────────────────
function MyDeals() {
  const pane = usePane(() => API.deals());
  const [open, setOpen] = useState(null);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const deals = pane.rows;

  if (open) {
    const deal = deals.find((d) => d.agreement_id === open);
    if (!deal) return <LoadFailed reason="that deal is no longer in your list" />;
    return (
      <div>
        <button className="btn btn-sm mb-4" onClick={() => setOpen(null)}>← my deals</button>
        <div className="panel p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="display-sm">{deal.counterparty}</div>
              <div className="font-mono caption mt-1">{deal.agreement_id}</div>
            </div>
            <span className="chip chip-std">{deal.status}</span>
          </div>
          {/* The rail belongs to THIS deal and no other. */}
          <div className="mt-4 pt-4 border-t hair"><PipelineRail deal={deal} /></div>
        </div>
        <div className="mt-6">
          <NotBuiltYet
            what="The stages of this deal are not built."
            lands="WP-U12"
          />
        </div>
      </div>
    );
  }

  const mine = deals.filter((d) => d.status !== 'executed');
  return (
    <div>
      <TileStrip tiles={[
        { label: 'deals open', n: mine.length },
        { label: 'awaiting me', n: null },
        { label: 'awaiting others', n: null },
      ]} />
      {/* The two nulls are deliberate and render as an em dash. "Awaiting me"
          needs a read model that does not exist yet, and showing 0 would be a
          claim that nothing is waiting on this person — which is a different
          statement from "we have not worked this out yet". */}
      <div className="caption mt-2">
        Awaiting-me and awaiting-others are not computed yet — they need a read
        model on the backend, and a nought here would say nothing is waiting on
        you, which is not the same as not knowing.
      </div>

      <div className="mt-6">
        <PanelHead title="My deals" sub="Every engagement you opened, and nobody else's." />
        <WaitingList
          items={deals.map((d) => ({
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
            sub="A deal appears here when you open one. Nothing is shown from anyone else's list — the database scopes this to you, so another buyer's engagements never reach this browser at all."
          />}
        />
      </div>
    </div>
  );
}

// ── Legal reviewer ───────────────────────────────────────────────────────
function ReviewDesk() {
  const tickets = usePane(() => API.waitingTickets());
  const queue = usePane(() => API.countersignQueue());

  if (tickets.status === 'loading' || queue.status === 'loading') return <Loading />;
  if (tickets.status === 'failed') return <LoadFailed reason={tickets.reason} />;

  return (
    <div>
      <TileStrip tiles={[
        { label: 'tickets waiting', n: tickets.rows.length },
        { label: 'grants to countersign', n: queue.status === 'loaded' ? queue.rows.length : null },
        { label: 'override requests', n: null },
        { label: 'concessions to approve', n: null },
      ]} />

      <div className="mt-6">
        <PanelHead
          title="Waiting on Legal"
          sub="Oldest first. The longest wait is the one this desk exists to show."
        />
        <WaitingList
          items={tickets.rows.map((t) => ({
            key: t.ticket_id,
            title: `${t.clause_id ?? t.category_key ?? 'ticket'} · ${t.agreement_id ?? 'no deal'}`,
            sub: `opened by ${t.opened_by}`,
            at: t.opened_at,
            chips: <span className="chip chip-pending">{t.state}</span>,
          }))}
          empty={<Empty
            kicker="review desk"
            line="Nothing is waiting on Legal."
            sub="Tickets, override decisions, concession approvals and holds all land here, oldest first."
          />}
        />
      </div>

      {/* The countersign queue lives in Legal's OWN workspace as well as the
          admin console. A queue that lives only where the people who must clear
          it never look is a queue that does not get cleared — WP-U08 makes this
          explicit and it is honoured here. */}
      {queue.status === 'loaded' && queue.rows.length > 0 && (
        <div className="mt-6">
          <PanelHead
            title="Waiting for your countersign"
            sub="These grants confer nothing at all while they sit here."
          />
          <WaitingList
            items={queue.rows.map((g) => ({
              key: g.grant_id,
              title: `${g.display_name || g.person} → ${g.role}`,
              sub: `proposed by ${g.proposed_by}${g.reason ? ` · ${g.reason}` : ''}`,
              at: g.proposed_at,
              chips: <span className="chip chip-pending">pending</span>,
            }))}
            empty={null}
          />
          <div className="caption mt-2">
            Accepting one is built in <span className="font-mono">WP-U08</span>.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Administrator ────────────────────────────────────────────────────────
function PeopleAndAccess() {
  const people = usePane(() => API.people());
  const queue = usePane(() => API.countersignQueue());

  if (people.status === 'loading') return <Loading />;
  if (people.status === 'failed') return <LoadFailed reason={people.reason} />;

  const rows = people.rows;
  const active = rows.filter((p) => p.state === 'active');
  const pending = rows.filter((p) => p.state === 'active' && !p.effective_role);

  return (
    <div>
      <TileStrip tiles={[
        { label: 'people with access', n: active.filter((p) => p.effective_role).length },
        { label: 'awaiting countersign', n: pending.length },
        { label: 'revoked', n: rows.filter((p) => p.state === 'revoked').length },
        // The ADR-0008 residual, made a visible goal rather than a note in a
        // document. Every account is one named person by construction.
        { label: 'shared accounts', n: 0 },
      ]} />

      <div className="mt-6">
        <PanelHead
          title="People and access"
          sub="One person, one role. A second role is a revoke and a grant, both recorded."
        />
        <WaitingList
          items={rows.map((p) => ({
            key: p.person,
            title: p.display_name || p.person,
            sub: `${p.person}${p.unit ? ` · ${p.unit}` : ''} · granted by ${p.created_by}`,
            at: p.created_at,
            chips: (
              <>
                <span className="chip chip-std">{p.declared_role}</span>
                {p.state === 'revoked'
                  ? <span className="chip chip-err">revoked</span>
                  : p.effective_role
                    ? <span className="chip chip-ok">effective</span>
                    // AMBER, never green. A grant that looks effective before
                    // its countersign is the countersign rule undone in pixels.
                    : <span className="chip chip-pending">awaiting countersign</span>}
              </>
            ),
          }))}
          empty={<Empty kicker="people" line="Nobody has an account yet."
                        sub="The bootstrap ceremony creates the first two." />}
        />
      </div>

      <div className="mt-6 caption">
        Granting, countersigning and revoking through this screen land in{' '}
        <span className="font-mono">WP-U08</span>. The list above is real.
      </div>
    </div>
  );
}

function SystemHealth() {
  const pane = usePane(() => API.health());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  // never_ran is its own chip, visibly distinct from both pass and fail.
  // Absence of evidence rendered as evidence is the failure WP-U04 exists to
  // prevent, and a green tile for a check nobody has run is exactly that.
  const chipFor = (state) => {
    if (state === 'pass') return <span className="chip chip-ok">verified</span>;
    if (state === 'fail') return <span className="chip chip-err">failed</span>;
    if (state === 'due') return <span className="chip chip-pending">due</span>;
    if (state === 'none due') return <span className="chip chip-std">none due</span>;
    return <span className="chip chip-unknown">never run</span>;
  };

  return (
    <div>
      <PanelHead
        title="System health"
        sub="Evidence, not decoration. A tile is green only when a check actually ran."
      />
      <div className="panel">
        {pane.rows.map((t) => (
          <div className="waiting-row" key={t.tile}>
            <div>
              <div className="text-[13px]" style={{ color: 'var(--ink)' }}>{t.tile}</div>
              {t.detail && <div className="caption mt-0.5">{t.detail}</div>}
            </div>
            <div className="flex items-center gap-3">
              {chipFor(t.state)}
              <span className="waiting-age">{t.as_of ? since(t.as_of) : '—'}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="caption mt-3">
        Running the checks and the retention monitor land in{' '}
        <span className="font-mono">WP-U09</span>.
      </div>
    </div>
  );
}

// ── Auditor ──────────────────────────────────────────────────────────────
function AccessHistory() {
  const pane = usePane(() => API.accessHistory());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;
  return (
    <div>
      <PanelHead
        title="Access history"
        sub="Every act on somebody's access, in order. Append-only, so this is the whole story."
      />
      <WaitingList
        items={pane.rows.map((g) => ({
          key: g.grant_id,
          title: `${g.action} · ${g.person} · ${g.role}`,
          sub: `by ${g.acted_by}${g.reason ? ` — ${g.reason}` : ''}${g.is_bootstrap ? ' · bootstrap' : ''}`,
          at: g.acted_at,
          chips: <span className={`chip ${g.action === 'revoked' ? 'chip-err'
            : g.action === 'countersigned' ? 'chip-ok' : 'chip-std'}`}>{g.action}</span>,
        }))}
        empty={<Empty kicker="access history" line="Nothing has been granted yet." />}
      />
      <div className="caption mt-3">
        Filtering and export land in <span className="font-mono">WP-U09</span>.
      </div>
    </div>
  );
}

// ── The router ───────────────────────────────────────────────────────────
// Every entry is either a real pane or an honest note about where it lands.
// Nothing here renders invented rows.
const PANES = {
  // Requester
  'my-deals':  () => <MyDeals />,
  'intake':    () => <NotBuiltYet what="The intake interview is not built." lands="WP-U12" />,
  'negotiate': () => <NotBuiltYet what="The negotiate inbox is not built." lands="WP-U12" />,
  'my-record': () => <NotBuiltYet what="Your own slice of the record is not built." lands="WP-U12" />,

  // Legal reviewer
  'review-desk':  () => <ReviewDesk />,
  'tickets':      () => <NotBuiltYet what="Ticket adjudication is not built." lands="WP-U11" />,
  'approvals':    () => <NotBuiltYet what="Concession approvals are not built." lands="WP-U11" />,
  'negotiations': () => <NotBuiltYet what="Negotiation rounds are not built." lands="WP-U11" />,
  'holds':        () => <NotBuiltYet what="Opening a hold is not built." lands="WP-U11" />,

  // Legal admin
  'library':    () => <NotBuiltYet what="The clause library is not built." lands="WP-U13" />,
  'ladders':    () => <NotBuiltYet what="Ladders and conflict rules are not built." lands="WP-U13" />,
  'governance': () => <NotBuiltYet what="Owner decisions are not editable here yet." lands="WP-U13" />,
  'retention':  () => <NotBuiltYet what="Holds and retention are not built." lands="WP-U13" />,

  // Auditor
  'the-record':     () => <NotBuiltYet what="The chain explorer is not built." lands="WP-U14" />,
  'quality':        () => <NotBuiltYet what="Review quality is not built." lands="WP-U14" />,
  'origin-mix':     () => <NotBuiltYet what="The origin mix is not built." lands="WP-U14" />,
  'access-history': () => <AccessHistory />,

  // Viewer
  'reading-room': () => <NotBuiltYet what="The reading room is not built." lands="WP-U14" />,

  // Administrator
  'people':   () => <PeopleAndAccess />,
  'settings': () => <NotBuiltYet what="The settings panes are not built." lands="WP-U09" />,
  'health':   () => <SystemHealth />,
  'watchers': () => <NotBuiltYet what="Watchers and notices are not built." lands="WP-U09" />,
};

// Render a pane ONLY if it belongs to this role's tab set.
//
// This is the URL half of the principle. Hiding a tab is cosmetic — anybody can
// type an address — so a route outside the role's set resolves to a refusal
// having fetched nothing at all. Note what it does NOT do: it does not call the
// endpoint and render the refusal that comes back. There is no request, so
// there is no possibility of data arriving and being hidden on screen.
function Workspace({ role, tab }) {
  const allowed = WORKSPACES[role].tabs.some((t) => t.key === tab);
  if (!allowed) {
    return <Refused
      what={`“${tab}” is not part of your workspace.`}
      role={role}
    />;
  }
  const pane = PANES[tab];
  if (!pane) return <NotBuiltYet what="This pane does not exist." />;
  return pane();
}
