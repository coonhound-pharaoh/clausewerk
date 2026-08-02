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

// ── The router ───────────────────────────────────────────────────────────
// Every entry is either a real pane or an honest note about where it lands.
// Nothing here renders invented rows.
const PANES = {
  // Requester
  'my-deals':  (me) => <MyDealsPane me={me} />,
  'intake':    () => <NotBuiltYet what="The intake interview is not built." lands="a later package" />,
  'negotiate': () => <NotBuiltYet what="The negotiate inbox is not built." lands="a later package" />,
  'vendors':   () => <FrictionPane />,
  'my-record': (me) => <MyRecordPane me={me} />,
  // OB-11/OB-15: one pane, whoever holds the tab — the scoping is the
  // obligation table's own policy, so a requester sees their book and Legal
  // admin the whole one, from the same render.
  'obligations': () => <ObligationsPane />,

  // Legal reviewer
  'review-desk':  (me) => <ReviewDeskPane me={me} />,
  'tickets':      (me) => <TicketsPane me={me} />,
  'approvals':    (me) => <OverridesPane me={me} />,
  'negotiations': () => <NotBuiltYet what="Negotiation rounds are not built." lands="a later package" />,
  'routing':      (me) => <RoutePane me={me} />,
  'holds':        (me) => <HoldsPane me={me} />,

  // Legal admin
  'library':    () => <LibraryPane />,
  'ladders':    () => <LaddersPane />,
  'governance': () => <GovernancePane />,
  'retention':  () => <RetentionPane />,

  // Legal admin and auditor share this one; the grant behind its endpoints is
  // the control, and a refusal renders as the database's sentence.
  'reporting':  () => <ReportingPane />,

  // Auditor
  'the-record':     () => <TheRecordPane />,
  'quality':        () => <QualityPane />,
  'origin-mix':     () => <OriginMixPane />,
  'access-history': () => <AccessHistoryPane />,

  // Viewer
  'reading-room': (me) => <ReadingRoomPane me={me} />,

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
