// The intake walk (AI-2): plain questions in, a proposed manifest out.
//
// WHAT THIS SCREEN IS
//
// The requester answers a fixed checklist in their own words. A model reads
// those answers and proposes a set of risks — or, when it cannot, a keyword
// classifier does. The requester sees the proposal, changes whatever they
// disagree with, confirms it, and the confirmed manifest goes through the same
// pre-flight and the same recorded act as one typed by hand. Nothing proceeds
// on a manifest the requester has not seen and submitted themselves —
// intake.py's own words.
//
// FOUR RULES, and every one of them is a promise the screen keeps rather than
// a decoration:
//
//   1. NOTHING PROPOSED LOOKS CONFIRMED. Every risk the classifier proposes is
//      drawn PENDING — amber, hatched, carrying the word — until a named person
//      confirms it. The moment they do, it stamps. That difference is the whole
//      reason a proposal is safe to show at all.
//
//   2. WHOSE WORDS ARE ON THE SCREEN IS NEVER AMBIGUOUS. The oversized serif
//      quotation mark in this product means A PERSON SAID THIS. On the word-list
//      path the justification IS the requester's own sentence, quoted, and gets
//      the mark. On the model path it is the model's reasoning, and it does not
//      — it is set plainly and labelled. Wrapping a machine's sentence in the
//      idiom that means a human wrote it would be the exact failure this
//      product sells against, on its own screen.
//
//   3. THE DISCLOSURE TELLS THE TRUTH ABOUT WHICH PATH RAN. Two paths reach
//      this screen. A model reads the answers and proposes the risks (AI-3);
//      when it cannot — no key, no network, the day's budget spent — a keyword
//      classifier does it instead, and the requester is told so, with the
//      reason.
//
//      Both labels are permanent, plain, and in the reading order: not a
//      tooltip, not an icon, not a footer (NC-14). And the label MATCHES what
//      happened, every time. An "AI proposed this" badge over a word-list
//      result is the same defect as no badge at all — it teaches people the
//      badge means nothing.
//
//   4. THE SOURCE COMES FROM THE ENDPOINT, and is 'llm' or 'fallback'. It is
//      not decided here. Both are values cw.run.manifest_source accepts, and
//      the difference survives into the run record permanently: "a model
//      proposed this and a named person confirmed it" and "a word list matched
//      it and a named person confirmed it" are different answers to the
//      question somebody asks six months later.

const { useState } = React;

// One answer per probe, held by probe id. Blank answers are dropped on the way
// out: the endpoint refuses an intake that is entirely blank, and sending
// empty strings would spend that refusal on an accident.
function answersFrom(text) {
  return Object.entries(text)
    .map(([probe, value]) => ({ probe, text: String(value || '').trim() }))
    .filter((a) => a.text);
}

// ── The disclosure, before anybody writes anything ────────────────────────
// Permanent, plain, and in the reading order — not a tooltip, not an icon, not
// a footer (NC-14). It sits above the questions because that is where somebody
// decides how much to write, and knowing a model will read it changes that.
function HowThisWorks({ version }) {
  return (
    <div className="panel-2 p-3 mt-3" data-testid="intake-disclosure">
      <div className="tag">how your answers are read</div>
      <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)', lineHeight: 1.7 }}>
        An AI model reads what you write here and proposes which risks the
        purchase raises. It chooses only from the risk categories your library
        already defines — it cannot invent one, and anything it proposes that
        your library does not define is listed rather than used. It proposes;
        it decides nothing. Nothing is recorded until you confirm it below.
        {version && <> The question set is version <span className="font-mono">{version}</span>.</>}
      </div>
    </div>
  );
}

// ── And afterwards: which path actually ran ───────────────────────────────
// THE LABEL MATCHES WHAT HAPPENED. The endpoint says whether the model
// answered or the word lists did, and says why when it was the word lists.
// A proposal from a keyword match wearing an "AI" label would be worse than
// no label, because the next one people see would mean nothing either.
function WhatProposedThis({ source, absence }) {
  const byModel = source === 'llm';
  return (
    <div className="panel-2 p-3 mt-3" data-testid="proposal-provenance">
      <div className="flex items-center gap-2">
        <div className="tag">{byModel ? 'proposed by the model' : 'proposed by word lists'}</div>
        <Status state={byModel ? 'effective' : 'never'}>
          {byModel ? 'model answered' : 'model not used'}
        </Status>
      </div>
      <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)', lineHeight: 1.7 }}>
        {byModel
          ? <>A model read your answers and proposed the risks below, with its
              reasoning beside each. Read them: it is proposing, and you are
              deciding.</>
          : <>The model did not answer, so your words were matched against
              Legal's word lists instead — a simpler method that only spots
              phrases somebody thought of in advance. Check the list below more
              carefully than usual, and add anything it missed.
              {absence && <><br /><span className="font-mono">{absence}</span></>}</>}
      </div>
    </div>
  );
}

// ── One proposed risk ─────────────────────────────────────────────────────
// PENDING until confirmed, and the word says so beside the ink. The
// requester's own quoted words are the justification — quoted, not summarised,
// which is why they are in the serif quotation marks the rest of the product
// uses for a person speaking.
function ProposedRisk({ risk, confirmed, byModel, onChange, onDrop }) {
  return (
    <div className="panel-2 p-3 mb-2" data-testid="proposed-risk">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[12.5px]">{risk.category}</span>
          <Status state={confirmed ? 'effective' : 'pending'}>
            {confirmed ? 'confirmed' : 'proposed'}
          </Status>
        </div>
        <div className="flex items-center gap-2">
          <select className="font-mono" style={{ padding: '4px 8px' }}
                  value={risk.severity}
                  onChange={(e) => onChange({ ...risk, severity: e.target.value })}>
            <option value="Standard">Standard</option>
            <option value="High">High</option>
          </select>
          <button className="btn btn-sm" onClick={onDrop}>remove</button>
        </div>
      </div>
      {/* WHOSE SENTENCE THIS IS, drawn differently because it IS different.

          On the word-list path the justification is the requester's own answer,
          quoted — so it gets the oversized teal quotation mark, which in this
          product means A PERSON SAID THIS.

          On the model path it is the model's reasoning about what the requester
          wrote. It is set plainly and labelled. Putting a machine's sentence
          inside the human-voice idiom would be the precise failure this product
          exists to prevent, committed on its own screen. */}
      {byModel ? (
        <div className="panel-2 p-3 mt-2" data-testid="model-reasoning">
          <div className="tag">the model's reasoning</div>
          <div className="text-[13px] mt-1" style={{ color: 'var(--mute)', lineHeight: 1.6 }}>
            {risk.justification || 'No reasoning was given.'}
          </div>
        </div>
      ) : (
        <div className="panel-2 p-3 mt-2 relative" data-testid="own-words">
          <span className="font-serif" style={{
            position: 'absolute', left: 6, top: -6, fontSize: 34,
            color: 'var(--accent)', opacity: .55, lineHeight: 1 }}>“</span>
          <div className="font-serif italic" style={{
            fontSize: 15, lineHeight: 1.6, paddingLeft: 22 }}>
            {risk.justification}
          </div>
        </div>
      )}
    </div>
  );
}

// ── The pane ──────────────────────────────────────────────────────────────
function IntakePane({ me }) {
  const deals   = usePane(() => API.deals());
  const walk    = usePane(() => API.intakeProbes());
  const library = usePane(() => API.library());

  const [dealId, setDealId] = useState('');
  const [text, setText] = useState({});
  const [proposal, setProposal] = useState(null);   // the classifier's reply
  const [risks, setRisks] = useState([]);           // what the person will submit
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (deals.status === 'loading' || walk.status === 'loading') return <Loading />;
  // The walk is a FILE on the server (intake_walk.json). A deployment fault
  // reading it answers 500, and this says so rather than showing an empty
  // checklist that looks like a system with no questions.
  if (walk.status === 'failed') return <LoadFailed reason={walk.reason} />;
  if (deals.status === 'failed') return <LoadFailed reason={deals.reason} />;

  const probes = walk.body?.probes ?? [];
  const deal = deals.rows.find((d) => d.agreement_id === dealId) || null;
  const categories = [...new Set((library.rows ?? []).map((c) => c.category_label))]
    .filter(Boolean).sort();

  // A probe list with nothing in it is not an error and not an empty screen:
  // /intake/probes withholds any probe whose category the library does not
  // define, so an empty walk means the library has no categories yet. Saying
  // which of those it is, is the difference between a bug report and a task.
  if (!probes.length) {
    return <Empty
      kicker="intake"
      line="There are no questions to ask yet."
      sub="A question is only shown when the category it would raise is one your library defines. Either the question set is empty, or the library has no categories for it to reach — Legal owns both." />;
  }

  return (
    <div>
      {error && (
        <div className="panel p-3 mt-4" style={{ borderColor: 'var(--danger)' }}>
          <div className="tag" style={{ color: 'var(--danger)' }}>refused</div>
          <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)' }}>{error}</div>
        </div>
      )}

      {/* ── 1 · Which deal ────────────────────────────────────────────── */}
      <div className="panel p-4 mt-6">
        <PanelHead
          title="What is this for"
          sub="An intake is about one deal, and the counterparty comes from that deal rather than being typed again." />
        {deals.rows.length === 0
          ? <Empty
              kicker="no deals"
              line="You have no deals open."
              sub="Open one on the my-deals tab first. An intake composes the manifest for a deal, so there is nothing for it to attach to yet." />
          : (
            <select className="w-full font-mono" style={{ padding: '6px 8px' }}
                    data-testid="intake-deal"
                    value={dealId} onChange={(e) => {
                      setDealId(e.target.value);
                      setProposal(null); setConfirmed(false); setRisks([]);
                    }}>
              <option value="">choose a deal…</option>
              {deals.rows.filter((d) => d.status !== 'executed').map((d) => (
                <option key={d.agreement_id} value={d.agreement_id}>
                  {d.agreement_id} — {d.counterparty}
                </option>
              ))}
            </select>
          )}
      </div>

      {/* ── 2 · The questions ─────────────────────────────────────────── */}
      {deal && (
        <div className="panel p-4 mt-6">
          <PanelHead
            title="The questions"
            sub="Answer in your own words. There is no right length, and an answer that matches nothing is worth knowing about." />
          <HowThisWorks version={walk.body?.version} />

          {probes.map((p) => (
            <div className="mt-4" key={p.id}>
              <label className="section-label" htmlFor={`probe-${p.id}`}>
                {p.asks}
              </label>
              <textarea id={`probe-${p.id}`} className="mt-1.5 w-full" rows={3}
                        data-testid={`probe-${p.id}`}
                        value={text[p.id] || ''}
                        onChange={(e) => setText({ ...text, [p.id]: e.target.value })} />
            </div>
          ))}

          <div className="flex items-center gap-3 mt-4">
            <button className="btn btn-primary"
                    data-testid="classify-intake"
                    disabled={busy || answersFrom(text).length === 0}
                    onClick={async () => {
                      setBusy(true); setError(null);
                      setConfirmed(false);
                      const r = await API.classifyIntake({
                        vendor: deal.counterparty,
                        answers: answersFrom(text),
                      });
                      setBusy(false);
                      if (!r.ok) { setProposal(null); setError(r.reason); return; }
                      setProposal(r.body);
                      setRisks((r.body.risks || []).map((x) => ({ ...x })));
                    }}>
              read my answers
            </button>
            <span className="caption">
              This records that an intake was classified. It does not record a
              manifest and it does not assemble anything.
            </span>
          </div>
        </div>
      )}

      {/* ── 3 · What it proposes ──────────────────────────────────────── */}
      {proposal && (
        <div className="panel p-4 mt-6" data-testid="intake-proposal">
          <PanelHead
            title="What your answers propose"
            sub={confirmed
              ? 'Confirmed by you. This is now a manifest you are submitting.'
              : 'Proposed, not confirmed. Nothing here is a decision until you say so.'} />

          {/* Which path proposed it, before the list of what it proposed. */}
          <WhatProposedThis source={proposal.source}
                            absence={proposal.model_absence} />

          {/* A CATEGORY THE MODEL NAMED AND THIS LIBRARY DOES NOT DEFINE.
              Listed rather than used, and listed rather than dropped: it is
              either the model reaching for something that does not exist, or a
              real gap in the library — and only Legal can tell which. */}
          {(proposal.not_in_library || []).length > 0 && (
            <div className="panel-2 p-3 mt-3" data-testid="not-in-library">
              <div className="tag">not in your library</div>
              <div className="text-[12.5px] mt-1.5"
                   style={{ color: 'var(--mute)', lineHeight: 1.7 }}>
                The model also named{' '}
                <span className="font-mono">{(proposal.not_in_library || []).join(', ')}</span>,
                which your library does not define. It was not used and cannot
                be — nothing outside your library reaches a contract. Worth
                telling Legal: either the model reached for something that does
                not exist, or your library has a gap.
              </div>
            </div>
          )}

          {risks.length === 0
            ? <Empty
                kicker="nothing proposed"
                line="Your answers raised no risks."
                sub="That is a real answer and it may be the right one. Read it with the note above in mind: how much weight it carries depends on what proposed it." />
            : risks.map((risk, i) => (
                <ProposedRisk
                  key={`${risk.category}-${i}`}
                  risk={risk}
                  confirmed={confirmed}
                  byModel={proposal.source === 'llm'}
                  onChange={(next) => setRisks(risks.map((x, j) => j === i ? next : x))}
                  onDrop={() => { setRisks(risks.filter((_, j) => j !== i)); setConfirmed(false); }}
                />
              ))}

          {/* THE FIELD THIS SCREEN EXISTS TO SHOW. Not an error, not red, and
              not hidden when empty-handed: an answer that classified as
              nothing is a fact about Legal's word lists, and this is the only
              surface anybody sees it on. */}
          {(proposal.unmatched || []).length > 0 && (
            <div className="panel-2 p-3 mt-3" data-testid="intake-unmatched">
              <div className="tag">matched nothing</div>
              <div className="text-[12.5px] mt-1.5" style={{ color: 'var(--mute)', lineHeight: 1.7 }}>
                {(proposal.unmatched || []).length} of your answers matched none
                of the word lists:{' '}
                <span className="font-mono">{(proposal.unmatched || []).join(', ')}</span>.
                Nothing was dropped — your words are on the record either way.
                If one of those answers described a real risk, add it below by
                hand and tell Legal their question set has a gap.
              </div>
            </div>
          )}

          {!confirmed && (
            <button className="btn btn-primary mt-4"
                    data-testid="confirm-proposal"
                    onClick={() => setConfirmed(true)}>
              ✓ confirm these are the risks
            </button>
          )}
        </div>
      )}

      {/* ── 4 · The same pre-flight and the same act as any other manifest ── */}
      {confirmed && deal && (
        <AssembleContract
          deal={deal}
          categories={categories}
          start={{
            // FROM THE ENDPOINT, never decided here: 'llm' when the model
            // proposed these, 'fallback' when the word lists did. It is what
            // the run record keeps, permanently.
            source: proposal.source,
            risks: risks.map((r) => ({
              category: r.category,
              severity: r.severity,
              justification: r.justification || '',
            })),
          }}
          onAssembled={() => {
            setProposal(null); setConfirmed(false); setRisks([]); setText({});
          }}
          onError={setError}
        />
      )}
    </div>
  );
}
