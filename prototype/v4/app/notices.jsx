// Raising what you observed, and receiving it (NT-3, NT-4).
//
// Mike, 2026-08-05: "the admin should have a lot of abilities to notify
// different user types based on data they observe. Things have to be escalated
// somewhere."
//
// TWO COMPONENTS AND ONE RULE. `RaiseNotice` is a control that sits BESIDE the
// row it is about, pre-filled with that row's reference — so the citation
// cannot be mistyped and cannot be invented. `NoticesWaiting` is the other
// end: an open notice addressed to you or your role, in the workspace you
// already open, acknowledged as its own act with its own words.
//
// WHAT IS NOT HERE, AND MUST NOT ARRIVE:
//
//   · A compose box. There is no way on this screen to raise a notice about
//     nothing — every entry point passes a subject kind and a reference it
//     read off a row. The database refuses one that does not resolve, so a
//     free-text form would be a form that mostly fails; the reason it is
//     absent is better than that.
//
//   · A bell, a badge, or a red dot. An open notice appears in the waiting
//     panel and the daily digest, from one derivation. A bell would compete
//     with the waiting list and win, which is how the waiting list stops being
//     read.
//
//   · An acknowledge-all. One notice, one act, one reason — the same argument
//     the override findings settled.

const { useState } = React;

// ── Raising one ───────────────────────────────────────────────────────────
// `subject` is {kind, ref, about} — `about` being what to call it on screen.
// `routes` is GET /notice-routes, used ONLY to decide what to offer. It is not
// a permission check: the database refuses an unrouted notice whatever this
// renders, and the reason the list is consulted at all is that offering a
// button which always fails is worse than offering none.
function RaiseNotice({ me, subject, routes, onRaised }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const available = (routes ?? []).filter(
    (r) => r.raiser_role === me.role && r.subject_kind === subject.kind);

  // No route from this role for this kind of thing: no control. Not a disabled
  // one — a disabled button is a promise the system will not keep, and there
  // is nothing here for the person to do about it.
  if (available.length === 0) return null;

  if (done) {
    return (
      <span className="caption" data-testid="notice-raised">
        raised · it is now on their waiting list
      </span>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-sm" data-testid="raise-notice"
              onClick={() => { setOpen(true); setTo(available[0].to_role); }}>
        raise this
      </button>
    );
  }

  return (
    <div className="panel-2 p-3 mt-2" data-testid="raise-notice-form">
      <div className="section-label">Raise “{subject.about}”</div>

      <div className="flex gap-2 items-end mt-2">
        <div style={{ width: 180 }}>
          <label className="caption">To</label>
          <select className="mt-1 w-full font-mono" style={{ padding: '4px 8px' }}
                  data-testid="notice-to"
                  value={to} onChange={(e) => setTo(e.target.value)}>
            {available.map((r) => (
              <option key={r.to_role} value={r.to_role}>{r.to_role}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="caption">What you want them to know</label>
          <input className="mt-1 w-full" data-testid="notice-note"
                 value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {/* WHY THIS ROUTE EXISTS, in the words the migration recorded. It is not
          decoration: it is the answer to "why am I telling THEM about this",
          and it was written by whoever added the pair. */}
      <div className="caption mt-2">
        {(available.find((r) => r.to_role === to) || {}).why}
      </div>

      {error && (
        <div className="text-[12.5px] mt-2" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button className="btn btn-primary" disabled={busy || !note.trim()}
                data-testid="send-notice"
                onClick={async () => {
                  setBusy(true); setError(null);
                  const r = await API.raiseNotice({
                    to_role: to,
                    subject_kind: subject.kind,
                    subject_ref: subject.ref,
                    note: note.trim(),
                  });
                  setBusy(false);
                  if (!r.ok) { setError(r.reason); return; }
                  setOpen(false); setDone(true); setNote('');
                  if (onRaised) onRaised();
                }}>
          ✓ raise it
        </button>
        <button className="btn" onClick={() => { setOpen(false); setError(null); }}>
          cancel
        </button>
      </div>

      <div className="caption mt-2">
        This warns them. It blocks nothing and approves nothing — it lands on
        their waiting list, with your name on it, until somebody acknowledges it.
      </div>
    </div>
  );
}

// ── Receiving one ─────────────────────────────────────────────────────────
// Rendered at the top of a workspace, above whatever that workspace opens on,
// and ONLY when something is actually open. No empty panel: a heading with
// nothing under it teaches people to skip the heading.
function NoticesWaiting({ me }) {
  const pane = usePane(() => API.notices());
  const [busy, setBusy] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState(null);

  // A refused read shows nothing rather than an error at the top of every
  // workspace: notices are an addition to a screen that already worked, and a
  // failure here must not swallow the pane behind it. The one place that
  // WOULD be dishonest — showing zero — is not what this does; it shows
  // nothing at all, and the count is absent rather than wrong.
  if (pane.status !== 'loaded') return null;

  const mine = pane.rows.filter(
    (n) => n.state === 'open'
        && (n.to_person === me.person || n.to_role === me.role));
  if (mine.length === 0) return null;

  return (
    <div className="panel p-4 mb-6" data-testid="notices-waiting">
      <PanelHead
        title={mine.length === 1 ? 'Somebody raised something with you'
                                 : `${mine.length} things were raised with you`}
        sub="Observed by a colleague and sent here. Nothing is blocked by it — it stays until somebody says they have seen it." />

      {error && (
        <div className="text-[12.5px] mb-2" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {mine.map((n) => (
        <div className="panel-2 p-3 mb-2" key={n.notice_id} data-testid="notice">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <span className="font-mono text-[12.5px]">
                {n.subject_kind}: {n.subject_ref}
              </span>
              <span className="ml-3 caption">
                raised by {n.raised_by} · {since(n.raised_at)}
              </span>
            </div>
            <Status state="pending">open</Status>
          </div>

          {/* Their own words, in the idiom that means a person said this. */}
          <div className="panel-2 p-3 mt-2 relative">
            <span className="font-serif" style={{
              position: 'absolute', left: 6, top: -6, fontSize: 34,
              color: 'var(--accent)', opacity: .55, lineHeight: 1 }}>“</span>
            <div className="font-serif italic"
                 style={{ fontSize: 15, lineHeight: 1.6, paddingLeft: 22 }}>
              {n.note}
            </div>
          </div>

          <div className="flex gap-2 items-end mt-3">
            <div className="flex-1">
              <label className="caption">What you did about it (optional)</label>
              <input className="mt-1 w-full" style={{ padding: '4px 8px' }}
                     data-testid={`ack-note-${n.notice_id}`}
                     value={notes[n.notice_id] || ''}
                     onChange={(e) => setNotes({ ...notes, [n.notice_id]: e.target.value })} />
            </div>
            <button className="btn" disabled={busy === n.notice_id}
                    data-testid={`acknowledge-${n.notice_id}`}
                    onClick={async () => {
                      setBusy(n.notice_id); setError(null);
                      const r = await API.acknowledgeNotice({
                        notice_id: n.notice_id,
                        note: (notes[n.notice_id] || '').trim() || null,
                      });
                      setBusy(null);
                      if (!r.ok) { setError(r.reason); return; }
                      pane.reload();
                    }}>
              ✓ I have seen this
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── The intake question set, judged (IN-2) ────────────────────────────────
// The administrator's surface, by owner decision NI-5. It answers one
// question — are Legal's questions classifying anything? — and gives the
// administrator the act that gets the answer to Legal.
function IntakeCoveragePane({ me, routes }) {
  const coverage = usePane(() => API.intakeCoverage());
  const summary  = usePane(() => API.intakeCoverageSummary());

  if (coverage.status === 'loading') return <Loading />;
  if (coverage.status === 'failed') return <LoadFailed reason={coverage.reason} />;

  const total = (summary.rows ?? [])[0] || {};
  const classified = Number(total.classifications ?? 0);

  return (
    <div className="mt-8" data-testid="intake-coverage">
      <PanelHead
        title="The intake questions"
        sub="Whether the checklist Legal maintains is classifying what requesters actually write. Legal owns the questions; this counts what happened." />

      {/* NOTHING CLASSIFIED YET IS ITS OWN STATE, and it is not "everything is
          fine". A zero-per-cent gap rate on a system nobody has used would be
          the most reassuring lie this screen could tell. */}
      {classified === 0
        ? <Empty
            kicker="intake coverage"
            line="Nobody has been through the intake yet."
            sub="There is nothing to judge the questions by. This is not a clean bill of health — it is an absence of evidence, and the two are different facts." />
        : (
          <>
            <TileStrip tiles={[
              { label: 'intakes classified', n: classified },
              { label: 'answers read', n: Number(total.answers ?? 0) },
              // NULL share renders as a dash, never as 0.
              { label: 'answers matching nothing',
                n: total.unmatched_share === null || total.unmatched_share === undefined
                  ? '—' : `${total.unmatched_share}%` },
              { label: 'intakes with a gap', n: Number(total.with_a_gap ?? 0) },
            ]} />

            <div className="panel p-4 mt-4">
              <PanelHead
                title="Questions whose answers matched nothing"
                sub="Each one is a question a requester answered and the word lists had nothing for. It is a gap in the questions, not a mistake by the person." />

              {coverage.rows.length === 0
                ? <div className="caption">
                    None. Every answer given so far matched at least one term
                    list.
                  </div>
                : coverage.rows.map((row) => (
                    <div className="panel-2 p-3 mb-2" key={row.probe}
                         data-testid="coverage-gap">
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <span className="font-mono text-[12.5px]">{row.probe}</span>
                          <span className="ml-3 caption">
                            matched nothing {row.times_unmatched}{' '}
                            {row.times_unmatched === 1 ? 'time' : 'times'} ·
                            {' '}{row.people_affected}{' '}
                            {row.people_affected === 1 ? 'person' : 'people'} ·
                            {' '}last {since(row.last_unmatched)}
                          </span>
                        </div>
                        {/* THE ACT MIKE ASKED FOR, beside the row it is about
                            and pre-filled with that row's own reference. */}
                        <RaiseNotice
                          me={me} routes={routes}
                          subject={{ kind: 'intake_probe', ref: row.probe,
                                     about: `intake question ${row.probe}` }} />
                      </div>
                    </div>
                  ))}
            </div>
          </>
        )}
    </div>
  );
}
