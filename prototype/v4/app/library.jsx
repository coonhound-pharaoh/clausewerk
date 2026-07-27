// The Legal admin's library and ladders — WP-U13, the read half.
//
// WHAT IS HERE AND WHAT IS DELIBERATELY NOT. WP-U13 asks for four surfaces, and
// each has a reading half and an acting half. The reading halves are built here.
// **The acting halves have no endpoint in either language** — there is no
// activate, retire, supersede, conflict-rule edit, concession promotion, hold
// release or retention destruction among the 27 writes. Nobody removed them;
// the package was paused before anyone looked, and the frozen 52 never had them.
//
// So this file follows the rule the whole shell follows: **a pane either reads a
// real endpoint or says plainly that it is not built.** There is no third
// option, and in particular there is no button that would fail if pressed.
//
// THAT ABSENCE IS ALSO THE SAFEST STATE TO BE IN, which is worth saying so the
// next person does not "fix" it in a hurry. WP-U13's critical anti-pattern is a
// library edit that bypasses versioning: every change to approved wording is a
// NEW VERSION with its history intact, and an in-place edit affordance would be
// the mutation-surface invariant broken in the UI rather than in the schema.
// When those endpoints are built they must mint versions, never update them.
//
// THE COVERAGE-GAP RULE, from the common anti-pattern. A gap is surfaced, never
// framed as a system failure. The system's job ends at making the gap visible
// and giving the responsible person a place to act; the gap itself belongs to
// the people who own the library. The copy below is written to that line and
// should stay on it.

const { useState } = React;

// ── The library ───────────────────────────────────────────────────────────
function LibraryPane() {
  const pane = usePane(() => API.library());
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [open, setOpen] = useState(null);

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

      <NotBuiltYet
        what="Activating, retiring and superseding wording is not built."
        lands="an endpoint that does not exist yet in either language" />
      <p className="caption mt-3">
        When it is built, every change must mint a <strong>new version</strong>
        with its history intact. There is deliberately no in-place edit here:
        rewriting approved wording under the decisions already taken on it is the
        one thing this library exists to prevent.
      </p>
    </div>
  );
}

// ── Ladders ───────────────────────────────────────────────────────────────
function LaddersPane() {
  const pane = usePane(() => API.ladders());

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  if (pane.rows.length === 0) {
    return (
      <div>
        <PanelHead title="Ladders & rules" sub="The retreat path, per category and severity." />
        <Empty
          kicker="ladders"
          line="No ladder has been configured."
          sub="A ladder is the pre-approved retreat: preferred position, fallback,
               floor. Without one, a negotiation has nothing to descend." />
      </div>
    );
  }

  // Group the rung rows back into ladders. cw.ladder_board repeats the ladder's
  // health onto every rung so a table render needs no second result set; this
  // regroups for a per-ladder card.
  const ladders = [];
  for (const r of pane.rows) {
    let l = ladders.find((x) => x.ladder_id === r.ladder_id);
    if (!l) {
      l = { ladder_id: r.ladder_id, category_label: r.category_label,
            severity: r.severity, owner: r.owner, reviewed_on: r.reviewed_on,
            status: r.ladder_status, rungs: r.rungs, unusable: r.unusable_rungs,
            has_floor: r.has_floor, steps: [] };
      ladders.push(l);
    }
    // AN EMPTY LADDER ARRIVES AS ONE ROW WITH A NULL RUNG, and that row is the
    // one that matters most. cw.ladder_board LEFT JOINs its rungs precisely so a
    // rungless ladder still appears; dropping the null here would undo that at
    // the last possible moment and report a configuration error as absence.
    if (r.rung !== null && r.rung !== undefined) l.steps.push(r);
  }

  return (
    <div>
      <PanelHead title="Ladders & rules" sub="The retreat path, per category and severity." />

      <TileStrip tiles={[
        { label: 'ladders', n: ladders.length },
        { label: 'intact', n: ladders.filter((l) => l.status === 'intact').length },
        { label: 'need attention', n: ladders.filter((l) => l.status !== 'intact').length },
      ]} />

      <div className="mt-4">
        {ladders.map((l) => (
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
              </div>
            )}
          </div>
        ))}
      </div>

      <NotBuiltYet
        what="Reordering rungs, moving the floor, editing conflict rules and promoting a concession are not built."
        lands="endpoints that do not exist yet in either language" />
    </div>
  );
}
