// The shared idioms. One of each, deliberately.
//
// The UI inventory found four near-duplicate stat-tile components in the v3
// prototype. That is not a tidiness problem: four implementations of "what is
// waiting on you" drift apart, and the one nobody looks at is the one that goes
// wrong quietly. WP-U07 consolidates them into one strip and one list, and every
// workspace opens on those.

const { useState, useEffect, useCallback, useRef } = React;

// ── How long has this been waiting ────────────────────────────────────────
// Rendered from the recorded timestamp, never from a stored "age" — an age
// column is a fact that starts being wrong the moment it is written.
function since(ts) {
  if (!ts) return '—';
  const recorded = new Date(ts).getTime();
  if (!Number.isFinite(recorded)) return '—';
  const ms = Date.now() - recorded;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ── The stat-tile strip ───────────────────────────────────────────────────
// Zero is shown, muted, never hidden. "Nothing is waiting" is a real answer and
// a person needs to be able to tell it apart from a tile that failed to load.
function TileStrip({ tiles }) {
  return (
    <div className="tile-strip">
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <div className={`tile-n${t.n === 0 ? ' none' : ''}`}>
            {t.n === null || t.n === undefined ? '—' : t.n}
          </div>
          <div className="tile-l">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── The waiting list ──────────────────────────────────────────────────────
// Oldest first, always, and the oldest row is MARKED. Sort order is a control
// here, not a preference: the desk exists to make the longest wait visible, and
// a newest-first list quietly buries exactly the thing it was built to surface.
function WaitingList({ items, empty, onOpen }) {
  if (!items || items.length === 0) return empty;
  return (
    <div className="panel">
      {items.map((it, i) => (
        <div
          className={`waiting-row${i === 0 && items.length > 1 ? ' oldest' : ''}`}
          key={it.key}
          onClick={onOpen ? () => onOpen(it) : undefined}
          style={onOpen ? { cursor: 'pointer' } : undefined}
        >
          <div className="min-w-0">
            <div className="text-[13px] truncate" style={{ color: 'var(--ink)' }}>
              {it.title}
            </div>
            {it.sub && (
              <div className="caption mt-0.5 truncate">{it.sub}</div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {it.chips}
            <span className="waiting-age" title={it.at ?? ''}>{since(it.at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Honest empty states ───────────────────────────────────────────────────
// The existing idiom: a kicker, one serif sentence, at most one primary action.
//
// Two DIFFERENT emptinesses, and conflating them is the failure this package
// most needs to avoid:
//
//   <Empty>       nothing is here yet, and that is a true fact about the data.
//   <NotBuiltYet> this pane has no endpoint behind it. Saying so is the whole
//                 point — the alternative is a screen implying the system does
//                 something it does not.
function Empty({ kicker, line, sub, action }) {
  return (
    <div className="empty">
      <div className="empty-kicker">{kicker}</div>
      <div className="empty-line">{line}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function NotBuiltYet({ what, lands }) {
  return (
    <div className="empty">
      <div className="empty-kicker">not built yet</div>
      <div className="empty-line">{what}</div>
      <div className="empty-sub">
        There is no endpoint behind this pane, so there is nothing to show. It is
        empty rather than filled with an example, because a screen that
        demonstrates something the system cannot do is the thing this rebuild
        exists to stop. {lands && <>Lands in <span className="font-mono">{lands}</span>.</>}
      </div>
    </div>
  );
}

// The state a role reaches by typing a URL its own endpoints would refuse.
// Deliberately styled as an empty state and not as an error: nothing has gone
// wrong, the system is working. Red means error, never merely "no".
function Refused({ what, role, reason }) {
  return (
    <div className="refusal mt-6">
      <Empty
        kicker="refused"
        line={what}
        sub={
          <>
            You are acting as <span className="font-mono">{role}</span>, and this
            part of the system belongs to somebody else.{' '}
            {reason
              ? <>The database said: <span style={{ color: 'var(--mute)' }}>“{reason}”</span></>
              : <>Nothing was fetched — the address is not one your role can load,
                 so no data for it ever reached this browser.</>}
          </>
        }
      />
    </div>
  );
}

// ── Loading, and failing to load ──────────────────────────────────────────
// A pane that cannot load says so. It never renders as empty: "nothing is
// waiting on you" and "we could not ask" are different facts, and showing the
// second as the first is how somebody misses a queue.
function Loading() {
  return (
    <div className="empty">
      <div className="empty-kicker">loading</div>
      <div className="empty-line" style={{ color: 'var(--mute-2)' }}>…</div>
    </div>
  );
}

function LoadFailed({ reason }) {
  return (
    <div className="empty">
      <div className="empty-kicker">could not load</div>
      <div className="empty-line">This did not load.</div>
      <div className="empty-sub">
        <span style={{ color: 'var(--mute)' }}>“{reason}”</span>
        <br />
        Shown rather than rendered as empty, because “nothing is waiting on you”
        and “we could not ask” are different facts.
      </div>
    </div>
  );
}

// ── The hook every pane uses ──────────────────────────────────────────────
// Fetch once, hold three states — loading, failed, loaded — and never collapse
// the first two into an empty list.
function usePane(fetcher, deps = []) {
  const [state, setState] = useState({ status: 'loading', rows: [], reason: null });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState((s) => ({ ...s, status: 'loading' }));
    const r = await fetcher();
    if (request !== generation.current) return;
    if (r.ok) setState({ status: 'loaded', rows: r.rows, reason: null });
    else setState({ status: 'failed', rows: [], reason: r.reason, http: r.status });
  }, deps);
  useEffect(() => {
    reload();
    return () => { generation.current += 1; };
  }, [reload]);
  return { ...state, reload };
}

// A small panel header in the established idiom: title, italic serif subtitle.
function PanelHead({ title, sub, right }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <div className="section-label">{title}</div>
        {sub && (
          <div className="font-serif italic mt-1" style={{ fontSize: 15, color: 'var(--mute)' }}>
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
