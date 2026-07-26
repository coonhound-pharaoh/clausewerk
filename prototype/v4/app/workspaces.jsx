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
  'review-desk':  (me) => <ReviewDeskPane me={me} />,
  'tickets':      (me) => <TicketsPane me={me} />,
  'approvals':    (me) => <OverridesPane me={me} />,
  'negotiations': () => <NotBuiltYet what="Negotiation rounds are not built." lands="a later package" />,
  'holds':        (me) => <HoldsPane me={me} />,

  // Legal admin
  'library':    () => <NotBuiltYet what="The clause library is not built." lands="WP-U13" />,
  'ladders':    () => <NotBuiltYet what="Ladders and conflict rules are not built." lands="WP-U13" />,
  'governance': () => <NotBuiltYet what="Owner decisions are not editable here yet." lands="WP-U13" />,
  'retention':  () => <NotBuiltYet what="Holds and retention are not built." lands="WP-U13" />,

  // Auditor
  'the-record':     () => <NotBuiltYet what="The chain explorer is not built." lands="WP-U14" />,
  'quality':        () => <NotBuiltYet what="Review quality is not built." lands="WP-U14" />,
  'origin-mix':     () => <NotBuiltYet what="The origin mix is not built." lands="WP-U14" />,
  'access-history': () => <AccessHistoryPane />,

  // Viewer
  'reading-room': () => <NotBuiltYet what="The reading room is not built." lands="WP-U14" />,

  // Administrator
  'people':   (me) => <PeopleAndAccessConsole me={me} />,
  'settings': (me) => <SettingsPane me={me} />,
  'health':   () => <HealthPane />,
  'watchers': () => <WatchersPane />,
};

// Render a pane ONLY if it belongs to this role's tab set.
//
// This is the URL half of the principle. Hiding a tab is cosmetic — anybody can
// type an address — so a route outside the role's set resolves to a refusal
// having fetched nothing at all. Note what it does NOT do: it does not call the
// endpoint and render the refusal that comes back. There is no request, so
// there is no possibility of data arriving and being hidden on screen.
function Workspace({ me, tab }) {
  const allowed = WORKSPACES[me.role].tabs.some((t) => t.key === tab);
  if (!allowed) {
    return <Refused
      what={`“${tab}” is not part of your workspace.`}
      role={me.role}
    />;
  }
  const pane = PANES[tab];
  if (!pane) return <NotBuiltYet what="This pane does not exist." />;
  // The identity is passed to panes that need to know WHO is looking — the
  // people console shows a countersign button only to a Legal admin, and no
  // revoke button against the viewer's own row. Those are affordances, not
  // permissions: the database refuses the acts regardless, and a pane that got
  // this wrong would offer a button that fails rather than leak anything.
  return pane(me);
}
