// The Auditor's workspace — WP-U14, the half that reads everything.
//
// THE ONE RULE THIS FILE IS WRITTEN AROUND. The Auditor changes nothing, and
// the screen has to prove it rather than assert it. So there is **no mutation
// affordance anywhere in this file — not even a disabled one.**
//
// WP-U14's common anti-pattern names the temptation exactly: a disabled button
// standing in for an absent right. A greyed-out control says "you could, but not
// now", and invites somebody to go looking for the conditions under which it
// lights up. The truth is "this was never yours", and the honest rendering of a
// right you do not hold is nothing at all. The admin console already reasons
// this way about owner decisions.
//
// So: every `onClick` in this file is a filter, a view toggle, or an export.
// There is no other kind.
//
// WHY THE AUDITOR MAY EXPORT AND THE VIEWER MAY NOT. WP-U14 gives the Auditor
// "CSV export" in terms and gives the Viewer none, deliberately (ADR-0008). The
// Auditor already reads the whole record, so a copy of what they can see adds
// nothing. The reading room shows a contract to somebody OUTSIDE the deal, and
// letting them take a copy away is a different act nobody decided. That
// asymmetry is a decision, not an inconsistency — and 0017 leaves nothing in the
// schema for a future export button to call.
//
// ON THE MARKUP: this file introduces no new CSS and no new visual vocabulary.
// It reuses TileStrip, WaitingList, Empty, PanelHead and the `waiting-row`
// classes the rest of the workspace already uses. An earlier draft invented a
// table style; there is not one table anywhere else in this application, and a
// second design language would have been a bigger cost than the pane is worth.

const { useState } = React;

// ── The chain explorer ────────────────────────────────────────────────────
function TheRecordPane() {
  const pane = usePane(() => API.record());
  const health = usePane(() => API.health());
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [dense, setDense] = useState(false);

  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  // Filtering over rows the POLICY already returned — the same distinction the
  // access-history pane draws. Nothing here narrows a fetch that was broader
  // than this reader is entitled to; the fetch was already scoped by
  // cw.audit_event's read policy. An auditor is entitled to all of it, which is
  // precisely why this pane must not become the template for a narrower role.
  const rows = pane.rows.filter((e) =>
    (!kind || e.actor_kind === kind)
    && (!q
        || (e.event_type ?? '').includes(q)
        || (e.actor ?? '').includes(q)
        || (e.subject ?? '').includes(q)));

  const kinds = [...new Set(pane.rows.map((e) => e.actor_kind))].sort();

  const csv = () => {
    const head = ['seq','ts','actor','actor_role','actor_kind','event_type','subject','payload'];
    const body = rows.map((e) => head.map((k) => {
      const v = k === 'payload' ? JSON.stringify(e.payload ?? {}) : e[k];
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'the-record.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // The verified state comes from cw.health_summary, not from this screen. A
  // page that marked its own reading as verified would be checking itself.
  //
  // `never_ran` is its own state throughout this product and is NOT folded into
  // a failure: a check nobody has run and a check that failed are different
  // facts, and collapsing them tells an auditor a comforting lie in one
  // direction and an alarming one in the other.
  // The tile is named 'audit chain' in cw.health_summary. Worth stating: the
  // first draft looked for 'chain', found nothing, and rendered "not available"
  // — which is indistinguishable on screen from the health check genuinely
  // having no answer. A lookup that misses should not be able to impersonate a
  // real state, so `missing` is now its own case below.
  const chain = health.status === 'loaded'
    ? health.rows.find((t) => t.tile === 'audit chain') : null;

  return (
    <div>
      <PanelHead
        title="The record"
        sub="Every governed act, newest first, in the order it was appended."
        right={<button className="btn btn-sm" onClick={csv} data-testid="export-record">
          ↓ export csv
        </button>}
      />

      <TileStrip tiles={[
        {
          label: health.status === 'failed' ? 'audit chain — health unreadable'
            : chain && chain.state === 'never_ran' ? 'audit chain — nobody has verified it yet'
            : chain && chain.detail ? `audit chain — ${chain.detail}`
            : 'audit chain',
          n: health.status === 'loading' ? '…'
            : health.status === 'failed' ? 'unknown'
            : chain ? chain.state : 'unknown',
        },
        { label: 'acts shown', n: rows.length },
        { label: 'in the window', n: pane.rows.length },
      ]} />

      <div className="flex gap-2 mb-3 mt-4">
        <input className="font-mono" style={{ width: 240, padding: '5px 9px' }}
               placeholder="actor, act or subject" value={q}
               onChange={(e) => setQ(e.target.value)}
               data-testid="record-search" />
        <select className="font-mono" style={{ padding: '5px 9px' }} value={kind}
                onChange={(e) => setKind(e.target.value)}
                data-testid="record-kind">
          <option value="">every actor kind</option>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button className="btn btn-sm self-center" onClick={() => setDense(!dense)}
                data-testid="record-view">
          {dense ? 'timeline' : 'compact'}
        </button>
        <div className="caption self-center">
          {rows.length} of {pane.rows.length}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          kicker="the record"
          line="No recorded act matches that."
          sub="The record itself is not empty — clear the filters to see it." />
      ) : dense ? (
        // The compact view. Same rows, one line each, sequence number first —
        // for reading a run of acts rather than examining one.
        <div className="panel" data-testid="record-compact">
          {rows.map((e) => (
            <div className="waiting-row" key={e.seq}>
              <div className="min-w-0 flex gap-3">
                <span className="font-mono caption shrink-0" style={{ width: 48 }}>{e.seq}</span>
                <span className="font-mono text-[13px] truncate">{e.event_type}</span>
                <span className="caption truncate">{e.subject ?? ''}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="caption">{e.actor}</span>
                <span className="waiting-age" title={e.ts ?? ''}>{since(e.ts)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <WaitingList
          items={rows.map((e) => ({
            key: e.seq,
            title: `${e.event_type}${e.subject ? ` · ${e.subject}` : ''}`,
            // A null actor_role is the OWNER, which holds no application role
            // (decision U3). Said out loud rather than left blank, because a
            // blank reads as missing data when it is a fact.
            sub: `${e.actor} ${e.actor_role ? `as ${e.actor_role}` : '— no application role'}`,
            at: e.ts,
            chips: <span className={`chip ${e.actor_kind === 'human' ? 'chip-std'
              : e.actor_kind === 'controller' ? 'chip-pending' : 'chip-unknown'}`}>
              {e.actor_kind}
            </span>,
          }))}
          empty={null}
        />
      )}

      <p className="caption mt-3">
        The newest 500 acts. Whether the chain verifies is reported by the health
        check above, not decided by this screen.
      </p>
    </div>
  );
}

// ── Review quality ────────────────────────────────────────────────────────
// The unedited-approval rate, which is the figure Legal watches because the
// pressure it measures is real: a fluent draft is approved faster than a blank
// page is filled.
function QualityPane() {
  const pane = usePane(() => API.quality());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const q = pane.rows[0] ?? {};
  const verified = Number(q.verified ?? 0);
  const rate = q.unedited_rate;
  // NULL IS NOT ZERO, and this is the distinction the whole pane turns on.
  // cw.review_quality returns null when nothing has been verified — there is no
  // denominator. Rendering that as 0% would report perfect discipline from an
  // empty queue, which is the most flattering possible lie.
  const unmeasured = rate === null || rate === undefined;

  return (
    <div>
      <PanelHead
        title="Review quality"
        sub="How often an approval went through with the wording untouched." />

      <TileStrip tiles={[
        {
          label: unmeasured ? 'approved unedited — nothing verified yet'
                            : `approved unedited · ${q.verified_unedited} of ${verified}`,
          n: unmeasured ? '—' : `${Math.round(Number(rate) * 100)}%`,
        },
        { label: 'verified — wording that entered the library', n: verified },
        { label: 'rejected — turned back, each with a reason', n: Number(q.rejected ?? 0) },
      ]} />

      {unmeasured && (
        <p className="caption mt-4" data-testid="quality-unmeasured">
          No approvals to measure yet. That is <strong>not</strong> a rate of
          zero, and it is not a rate of one hundred — there is nothing to divide.
        </p>
      )}

      <p className="caption mt-3">
        Measured from what was stored, not reported by anyone.
        <strong> What the number should be is Legal's to set with counsel</strong> —
        the system measures it and shows it, and must never pick it.
      </p>
    </div>
  );
}

// ── Origin mix ────────────────────────────────────────────────────────────
// Where the approved wording actually came from. The provenance question
// ADR-0006 exists to keep answerable: how much of our library did a machine
// draft?
function OriginMixPane() {
  const pane = usePane(() => API.originMix());
  if (pane.status === 'loading') return <Loading />;
  if (pane.status === 'failed') return <LoadFailed reason={pane.reason} />;

  const rows = pane.rows;

  if (rows.length === 0) {
    return (
      <div>
        <PanelHead title="Origin mix" sub="Where the approved wording came from." />
        <Empty
          kicker="origin mix"
          line="The library has no clause versions, so there is no origin to report."
          sub="An empty library, not a failed read." />
      </div>
    );
  }

  const totalChars = rows.reduce((n, r) => n + Number(r.characters ?? 0), 0);

  return (
    <div>
      <PanelHead
        title="Origin mix"
        sub="Where the approved wording came from, by character as well as by count." />

      <WaitingList
        items={rows.map((r) => {
          const chars = Number(r.characters ?? 0);
          const share = totalChars === 0 ? 0 : Math.round((chars / totalChars) * 100);
          return {
            key: r.origin,
            title: `${r.origin} — ${share}% of the library's text`,
            sub: `${Number(r.versions ?? 0)} versions, `
               + `${Number(r.selectable_versions ?? 0)} selectable, `
               + `${chars.toLocaleString()} characters`,
            at: null,
            chips: <span className={`chip ${r.origin === 'legal_authored' ? 'chip-ok'
              : r.origin === 'external' ? 'chip-pending' : 'chip-std'}`}>
              {r.origin}
            </span>,
          };
        })}
        empty={null}
      />

      <p className="caption mt-3">
        Counted by characters as well as by version, because one long AI-drafted
        clause and one short one are not the same amount of machine authorship.
        <strong> Origin is immutable</strong> — a version's origin cannot be
        rewritten after approval, so this is a record and not a current opinion.
      </p>
    </div>
  );
}
