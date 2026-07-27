// The Viewer's reading room — WP-U14, the half that reads exactly what it was
// shown and nothing else.
//
// WHAT THIS ROLE IS FOR. ADR-0008 created the viewer so a signed contract could
// be shown to somebody — a security lead, a finance partner, a counterparty's
// counsel — without giving them any way to change it. Until 0017 the "shown to"
// half did not exist: nothing recorded who had been shown what, and a viewer
// could read every signed contract in the system. This pane is the surface over
// the mechanism that closed that.
//
// THREE RULES, all from WP-U14, and each is a way this screen could quietly
// become something else:
//
//   1. **NOTHING IS FETCHED BROADER THAN "THIS SHARE, THIS PERSON."** The two
//      endpoints take no parameters at all. There is nothing for this pane to
//      pass, which is the point — the moment the browser can name an agreement,
//      the scoping is a careful query instead of a rule, and a careful query is
//      one edit away from a careless one.
//
//   2. **NO EXPORT. NOT ANYWHERE, NOT EVEN CONVENIENTLY.** ADR-0008 withheld it
//      deliberately: showing somebody a contract and letting them take a copy
//      away are different acts, and only the first was decided. There is no
//      endpoint, nothing in the schema for one to call, and a test on each side
//      that fails if one appears. If a screen ever seems to need it, that is a
//      decision for the owner, not an endpoint.
//
//   3. **NO DISABLED CONTROLS.** A read-only role gets a read-only screen, not a
//      greyed-out editor. Same reasoning as the auditor's workspace: a disabled
//      button says "you could, but not now", and the truth is "this was never
//      yours".
//
// WHAT A VIEWER SEES THAT NOBODY EXPECTS: the approval. cw.reading_room_clause
// carries each clause's reviewer, approval date and origin, because being shown
// a contract is useless if you cannot see whose language it is — that is the
// whole of the socialisation audience's reason for existing.

const { useState } = React;

function ReadingRoomPane({ me }) {
  const shares = usePane(() => API.readingRoom());
  const clauses = usePane(() => API.readingRoomClauses());
  const [open, setOpen] = useState(null);

  if (shares.status === 'loading') return <Loading />;
  if (shares.status === 'failed') return <LoadFailed reason={shares.reason} />;

  // THE EMPTY ROOM IS A REAL ANSWER AND MUST READ AS ONE. "Nothing has been
  // shared with you" is a true fact about this person's situation, not a
  // failure and not an unbuilt pane. Conflating it with either would be the
  // trap the two empty-state components exist to prevent — and getting it wrong
  // in the alarming direction ("something went wrong") would send somebody
  // chasing a fault that is not there.
  if (shares.rows.length === 0) {
    return (
      <div>
        <PanelHead
          title="Reading room"
          sub="The agreements somebody has shown you, and why." />
        <Empty
          kicker="reading room"
          line="Nothing has been shared with you."
          sub="When Legal shares a signed agreement with you it appears here, with
               the reason it was shared. There is nothing to ask for and nothing
               to search — you see what you were shown." />
      </div>
    );
  }

  const current = open
    ? shares.rows.find((s) => s.agreement_id === open) : null;

  return (
    <div>
      <PanelHead
        title="Reading room"
        sub="The agreements somebody has shown you, and why." />

      <WaitingList
        items={shares.rows.map((s) => ({
          key: s.share_id,
          title: `${s.counterparty}${s.agreement_id ? ` · ${s.agreement_id}` : ''}`,
          // WHY, always. A share with no stated purpose is one nobody can
          // review later, and the schema refuses one — so it is always here to
          // show, and showing it is what makes "who showed me this, and what
          // for?" answerable by the person being shown.
          sub: `shared by ${s.shared_by} — ${s.purpose}`,
          at: s.shared_at,
          chips: <span className="chip chip-std">{s.executed_on ? 'signed' : 'agreement'}</span>,
        }))}
        onOpen={(it) => {
          const row = shares.rows.find((s) => s.share_id === it.key);
          setOpen(row && row.agreement_id === open ? null : (row && row.agreement_id));
        }}
        empty={null}
      />

      {current && (
        <div className="mt-6">
          <PanelHead
            title={`${current.counterparty} — the paper`}
            sub={`Effective ${current.effective_on ?? '—'}`
               + `${current.term_end ? `, through ${current.term_end}` : ''}.`} />

          {clauses.status === 'loading' && <Loading />}
          {clauses.status === 'failed' && <LoadFailed reason={clauses.reason} />}
          {clauses.status === 'loaded' && (() => {
            // Filtering rows the POLICY already returned. cw.reading_room_clause
            // is scoped to this person's shares in its own WHERE clause, so this
            // narrows a list that was already narrow — it does not hide anything
            // that arrived and should not have.
            const body = clauses.rows.filter((c) => c.agreement_id === current.agreement_id);
            if (body.length === 0) {
              return <Empty
                kicker="the paper"
                line="This agreement records no clause-by-clause decisions."
                sub="It was signed, but the run behind it did not record per-clause
                     choices — so there is nothing to show here rather than
                     something missing." />;
            }
            return (
              <div className="panel">
                {body.map((c) => (
                  <div className="waiting-row" key={`${c.clause_id}@${c.version}`}
                       style={{ alignItems: 'flex-start' }}>
                    <div className="min-w-0">
                      <div className="text-[13px]" style={{ color: 'var(--ink)' }}>
                        {c.title}
                        <span className="caption"> · {c.clause_id}@v{c.version}</span>
                      </div>
                      <div className="caption mt-1" style={{ whiteSpace: 'pre-wrap' }}>
                        {c.body}
                      </div>
                      {/* THE ONE PLACE A VIEWER SEES AN APPROVAL. Being shown a
                          contract is useless if you cannot see whose language it
                          is — this is WP-U14's SOW-departure visibility rule and
                          the socialisation audience's whole reason for being. */}
                      <div className="caption mt-1.5">
                        {c.reviewer
                          ? `approved by ${c.reviewer}${c.approved_on ? ` on ${c.approved_on}` : ''}`
                          : 'no approver recorded'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`chip ${c.origin === 'legal_authored' ? 'chip-ok'
                        : c.origin === 'external' ? 'chip-pending' : 'chip-std'}`}>
                        {c.origin ?? 'origin unrecorded'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      <p className="caption mt-3">
        You see what was shared with you, and the sharing is recorded — who
        showed you this, when, and why. <strong>There is nothing to export</strong>:
        being shown a contract and taking a copy away are different acts, and
        only the first one was decided.
      </p>
    </div>
  );
}
