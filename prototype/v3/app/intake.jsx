// R6 — Intake with split-pane hero, named scenarios, typographic commitment
function IntakePanel({ messages, setMessages, onProposeManifest, setPhase, manifest, setTab, demoFeed, ledger }) {
  const stats = useMemo(() => {
    const L = ledger || INITIAL_LEDGER;
    const cats = new Set(L.map(c => c.cat));
    // rule combos = distinct (category × severity) pairs represented in the ledger
    const combos = new Set(L.map(c => c.cat + '|' + c.sev)).size;
    return { clauses: L.length, categories: cats.size, combos };
  }, [ledger]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [autoBrief, setAutoBrief] = useState(null); // { name, brief } when auto-interviewing
  const [autoStatus, setAutoStatus] = useState(''); // human-readable label of what auto-pilot is doing
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking, autoStatus]);

  // Allow demo mode to push messages in
  useEffect(() => {
    if (demoFeed && demoFeed.text) {
      sendMessage(demoFeed.text);
    }
  }, [demoFeed?.nonce]);

  // Build the interviewer prompt for a given conversation
  function buildInterviewerPrompt(convo, userTurns) {
    return `You are the Intake agent for a contract assembly system — an experienced procurement attorney conducting a thorough risk-discovery interview at the START of a procurement, BEFORE any supplier proposal or contract is in hand.

Your job: understand the BUYER'S engagement — what is being bought, why, and what could go wrong — so the system can assemble a contract that imposes the RIGHT REQUIREMENTS on the eventual supplier. You are NOT auditing a supplier. You are NOT reviewing a proposal. The supplier may not even be selected yet.

== CRITICAL FRAMING — READ TWICE ==
The contract we draft will SET THE STANDARDS the supplier must meet. We dictate the floor; we do not ask permission.
  - We do NOT ask "does the supplier carry $5M cyber liability insurance?" — we ask "given this engagement's data exposure, what insurance limits should we REQUIRE?"
  - We do NOT ask "does the supplier hold SOC 2 Type II?" — we ask "what security posture should we DEMAND given the data and access involved?"
  - We do NOT ask "what's the supplier's RTO?" — we ask "what RTO/RPO does the business NEED, and what penalty if missed?"
  - We do NOT ask "does the supplier subcontract?" — we ask "do we want to RESTRICT subcontracting, require consent, prohibit offshore?"
  - We do NOT ask about supplier infrastructure, supplier headcount, supplier financials unless the requester volunteers concern about supplier viability — and even then, frame as "should we require a parent guarantee / financial covenant / escrow?"

Acceptance criteria, testing terms, warranty periods, SLAs, insurance limits, indemnity caps, IP ownership, liquidated damages, audit rights, exit obligations — these are STANDARDS WE SET, not facts we discover about the supplier.

Do NOT draft legal language. Do NOT lecture. Ask sharp, specific questions a senior procurement lawyer would ask the BUSINESS REQUESTER (not the supplier).

== RISK SURFACE TO COVER ==
Across the interview, develop a clear picture of every dimension plausibly relevant to THIS engagement. Predict which apply even if the requester hasn't named them.

  What's being bought:    SaaS, custom build, hardware, professional services, content/marketing, resale, hybrid; one-shot vs ongoing
  Why & how critical:     business purpose; mission-critical / production-blocking / nice-to-have; downtime tolerance; what breaks if it fails
  Commercial shape:       contract value, term, renewal posture WE want, payment cadence WE want, escalator caps WE'll accept
  Data exposure:          what categories of OUR data the supplier will touch (PII, PHI, financial, employee, customer, IP), volume, residency requirements WE need to impose, cross-border posture, AI/ML training prohibitions WE want
  Security floor:         what security controls WE will require (SOC 2 attestation, encryption standards, MFA, pen testing cadence, breach notice windows)
  IP & deliverables:      what WE need to own vs license; work-for-hire posture; open-source disclosure WE'll require; AI-output ownership stance
  Acceptance & quality:   what "done" looks like; testing/UAT regime WE want; warranty period WE require; remediation expectations
  Operational protection: SLA targets WE need; service credits; RTO/RPO; business-continuity expectations; source-code escrow trigger
  People & access:        will supplier staff need our systems / premises? background-check requirement WE'll impose; offshore restriction; non-solicit
  Regulatory regime:      what regs apply to the WORK (HIPAA, GLBA, FERPA, FedRAMP, CMMC, FAR/DFARS, GDPR, export controls) — these are non-negotiable floors
  Physical / on-site:     on-site work, hardware delivery dates, OSHA, lien protection WE need, title/risk of loss
  Exit & wind-down:       transition assistance WE'll require, data portability format, post-term survival, change-of-control consent
  Risk transfer:          insurance limits WE'll require, indemnity scope (IP, data, bodily injury), liability cap posture WE want, super-cap carve-outs

== PREDICT, DON'T JUST RECEIVE ==
From whatever the requester has said, INFER likely hidden risks and ask about them directly:
  - Marketing/creative work → talent/music/image rights clearances; usage scope and territory WE need.
  - Cloud / SaaS → data residency WE require; AI-training prohibition; exit data-export format WE want.
  - AI/ML/LLM in scope → training-data prohibition WE'll impose; output ownership stance; IP indemnity scope WE need.
  - Hardware / on-site / install → fixed-date liquidated damages WE want; OSHA compliance; lien waivers; title transfer point.
  - Custom build / SOW → acceptance criteria WE'll set; warranty period; OSS disclosure obligation; change-control mechanic.
  - International / EU / APAC → data-transfer mechanism WE need; governing-law preference; withholding-tax handling.
  - Federal / public sector → FAR/DFARS flow-downs, FedRAMP/CMMC level required by the work itself.
  - Healthcare / financial / education → HIPAA/GLBA/FERPA regime, BAA requirement.
  - High value / strategic / hard to replace → super-cap WE want, source-code escrow, MFN, benchmarking, parent guarantee.
  - Multi-year → escalator cap WE'll accept, benchmarking right, change-of-control consent.
  - Anything where supplier might subcontract → consent right WE want, offshore prohibition, named-subprocessor list.

== INTERVIEW RHYTHM — STRICT ==
- Ask EXACTLY ONE question per turn. ONE. Not two. Not "and also." No sub-prompts, no compound questions, no "A — and B?" constructions, no parenthetical follow-ons, no semicolon-chained second asks.
- A turn is at most TWO sentences: an optional one-clause acknowledgement of the prior answer, then the single question. That's it.
- It is fine — preferred — to give light examples INSIDE the single question to guide the answer (e.g. "What's the rough contract value — ballpark like $50K, $500K, $5M?"). Examples are not extra questions.
- Do NOT ask the requester to enumerate multiple things in one breath. If you need three facts, that's three turns.
- Open with the single highest-leverage gap — usually what is being procured and why.
- Each subsequent turn targets a DIFFERENT risk dimension than the prior one. Do not loop on data-privacy and mission-criticality.
- If an answer is vague, ONE follow-up to pin it down, then move on.
- Frame every question from the BUYER's seat: "what should we require / impose / restrict / protect?" — never "what does the supplier have / do / offer?"
- Cover 8–12 substantive turns (you'll need more turns now that each turn is one question). Do not finish before turn 8 unless the engagement is genuinely trivial (<$25K, no data, no deliverables, no on-site, no IP). Do not exceed 14 turns.

== TONE ==
Direct, expert, time-respecting. No filler. No "great question." No restating policy. Sound like a senior procurement attorney who has run this interview a thousand times — and who knows the contract is the lever, not the supplier's marketing deck.

== OUTPUT ==
When — AND ONLY WHEN — you have a clear read on every plausibly-relevant dimension above, respond with exactly this token on its own line, optionally preceded by a one-sentence wrap-up:
READY_FOR_MANIFEST

Otherwise respond with your next probing question — ONE question, max two sentences total.

Conversation so far (${userTurns} requester turn${userTurns===1?'':'s'} elapsed):
${convo}

Your next turn:`;
  }

  // Call the interviewer LLM. Returns { content, ready } on success, or null on failure.
  async function askInterviewer(convoMessages) {
    const convo = convoMessages.map(m => `${m.role === 'user' ? 'Requester' : 'Intake'}: ${m.content}`).join('\n');
    const userTurns = convoMessages.filter(m => m.role === 'user').length;
    const prompt = buildInterviewerPrompt(convo, userTurns);
    const reply = (await window.claude.complete(prompt)).trim();
    if (reply.includes('READY_FOR_MANIFEST')) {
      const closing = reply.replace(/READY_FOR_MANIFEST/g, '').trim() || "Got it — I have enough to draft the manifest.";
      return { content: closing, ready: true };
    }
    return { content: reply, ready: false };
  }

  // Have the LLM answer the interviewer's last question on behalf of the requester,
  // using the scenario brief as ground truth. Keeps answers terse and human.
  async function answerAsRequester(convoMessages, brief) {
    const lastQ = [...convoMessages].reverse().find(m => m.role === 'assistant');
    const priorAnswers = convoMessages.filter(m => m.role === 'user').map((m, i) => `A${i+1}: ${m.content}`).join('\n');
    const prompt = `You are role-playing the BUSINESS REQUESTER answering an intake interview from a procurement attorney. You are NOT the attorney. You are the internal stakeholder who wants to procure something.

You have a CASE FILE describing the engagement. Use it as ground truth. Where the case file is silent on a detail the attorney asks about, give a REASONABLE answer that a competent business owner would give for THIS kind of engagement — do not invent unusual or out-of-character facts, do not contradict the case file, and do not refuse to answer.

== CASE FILE ==
${brief}

== STYLE ==
- One to three short sentences. Conversational, busy-business-owner tone.
- Plain language, not legalese. No bullet lists. No headers.
- Direct answer first, then a sentence of context if useful.
- It's fine to say "no preference, you decide" or "whatever's standard" for things outside the requester's expertise (insurance limits, exact SLA percentages, indemnity carve-outs).
- Never break character. Never mention you're an LLM, never mention "the case file", never address the attorney by role.
- Do not preface with "Sure," / "Great question," / "Well,". Start with the substantive answer.

== PRIOR ANSWERS YOU'VE ALREADY GIVEN (don't contradict) ==
${priorAnswers || '(none yet)'}

== ATTORNEY'S CURRENT QUESTION ==
${lastQ ? lastQ.content : '(no question yet — give a one-paragraph opening summary of the engagement)'}

Your answer:`;
    return (await window.claude.complete(prompt)).trim();
  }

  async function sendMessage(text) {
    if (!text.trim() || thinking) return;
    const userMsg = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setThinking(true);
    setPhase('thinking');

    try {
      const result = await askInterviewer(next);
      setMessages([...next, { role: 'assistant', content: result.content, ready: result.ready }]);
    } catch (e) {
      const q = pickFallbackQuestion(next);
      setMessages([...next, { role: 'assistant', content: q, fallback: true }]);
    } finally {
      setThinking(false);
      setPhase('idle');
    }
  }

  // Auto-interview loop: LLM plays both sides, using the scenario brief as ground truth.
  // Stops when the interviewer emits READY_FOR_MANIFEST, hits a hard turn cap, or errors.
  async function runAutoInterview(name, brief) {
    setAutoBrief({ name, brief });
    setPhase('thinking');

    // Seed: a brief opening line from the requester so the interviewer has something to react to.
    let convo = [{ role: 'user', content: `Hi — I want to kick off a new procurement. Here's the gist: ${brief.split(/\.\s/)[0]}.` }];
    setMessages(convo);

    const MAX_TURNS = 14;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // 1) Interviewer asks a question (or signals ready)
      setAutoStatus('Intake is composing the next question…');
      setThinking(true);
      let q;
      try {
        q = await askInterviewer(convo);
      } catch (e) {
        const fallback = pickFallbackQuestion(convo);
        q = { content: fallback, ready: false, fallback: true };
      }
      convo = [...convo, { role: 'assistant', content: q.content, ready: q.ready, fallback: q.fallback }];
      setMessages(convo);
      setThinking(false);

      if (q.ready) break;

      // small breath so the user can read each turn
      await new Promise(r => setTimeout(r, 650));

      // 2) Requester answers from the case file
      setAutoStatus('Requester is drafting an answer from the case file…');
      setThinking(true);
      let a;
      try {
        a = await answerAsRequester(convo, brief);
      } catch (e) {
        a = "Whatever's standard for this kind of engagement — defer to your judgment.";
      }
      convo = [...convo, { role: 'user', content: a, synthetic: true }];
      setMessages(convo);
      setThinking(false);
      await new Promise(r => setTimeout(r, 500));
    }

    setAutoStatus('');
    setPhase('idle');
  }

  function pickFallbackQuestion(conv) {
    const joined = conv.map(m => m.content).join(' ').toLowerCase();
    const turns = conv.filter(m => m.role === 'user').length;
    // Ordered checklist — ask about each missing dimension in turn.
    const probes = [
      { miss: !/buy|purchas|procur|saas|software|service|build|hardware|product|license|subscri|engage|scope/.test(joined),
        q: "What's being procured? A sentence is fine." },
      { miss: !/\$|\bspend|\bvalue|\bmillion|\bthousand|\bnte|\bk\b|fee/.test(joined),
        q: "Rough contract value — ballpark like $50K, $500K, $5M?" },
      { miss: !/\bterm|\byear|\bmonth|renew|evergreen|auto.renew|fixed term/.test(joined),
        q: "Term length you want — one year, multi-year, or open-ended?" },
      { miss: !/fixed|t&m|time.and.material|milestone|hourly|monthly|subscription|per seat|payment|invoice/.test(joined),
        q: "How should we structure payment — fixed fee, milestone-gated, T&M with an NTE, or subscription?" },
      { miss: !/data|pii|phi|gdpr|customer|employee|personal|record|user|sensitive/.test(joined),
        q: "What categories of our data will the supplier touch — PII, PHI, financial, employee, IP, or none?" },
      { miss: !/residen|region|us only|eu only|onshore|offshore data|cross.border|data location/.test(joined),
        q: "Where do we need that data to stay — US-only, EU-only, anywhere, or no constraint?" },
      { miss: !/security|encrypt|mfa|breach|incident|attest|control|posture|soc 2|soc2|iso 27/.test(joined),
        q: "What security floor should we require — e.g. SOC 2 Type II, ISO 27001, or something lighter?" },
      { miss: !/breach.notice|notice.window|24.hour|48.hour|72.hour/.test(joined),
        q: "How fast should the supplier be required to notify us of a breach — 24, 48, or 72 hours?" },
      { miss: !/ai|ml|llm|model|train|fine.tune|generative|algorithm/.test(joined),
        q: "Any AI or ML in scope?" },
      { miss: !/ip|deliverable|custom|build|work for hire|source code|derivative|own/.test(joined),
        q: "Are there custom deliverables we'll need to own outright?" },
      { miss: !/open source|oss|copyleft|gpl|mit license/.test(joined),
        q: "Should we require the supplier to disclose open-source components and restrict copyleft licenses?" },
      { miss: !/accept|uat|test|fitness/.test(joined),
        q: "What does \"done\" look like for acceptance — written sign-off, UAT pass, or something else?" },
      { miss: !/warrant|defect|remediat/.test(joined),
        q: "What warranty period do we want post-acceptance — 30, 90, 180 days, or longer?" },
      { miss: !/sla|uptime|99\.|service credit/.test(joined),
        q: "What uptime SLA should we demand — 99.5%, 99.9%, 99.99%?" },
      { miss: !/mission|production|critical|downtime tolerance/.test(joined),
        q: "How critical is this to operations — production-blocking, important-but-not-blocking, or nice-to-have?" },
      { miss: !/rto|rpo|recovery|continuity/.test(joined),
        q: "What recovery posture do we need — rough RTO and RPO targets?" },
      { miss: !/escrow|source.code escrow/.test(joined),
        q: "Do we want source-code escrow as a backstop?" },
      { miss: !/subcontract|subprocess|consent/.test(joined),
        q: "Should we require prior written consent before the supplier subcontracts any work?" },
      { miss: !/offshore|india|philippines|us.only delivery/.test(joined),
        q: "Should we prohibit offshore delivery, or is that fine?" },
      { miss: !/on.?site|premises|install|construction|hardware|equipment|delivery|ship/.test(joined),
        q: "Any on-site work, hardware delivery, or installation involved?" },
      { miss: !/liquidated damage|fixed date|delivery date/.test(joined),
        q: "Are there fixed delivery dates we'd want backed by liquidated damages?" },
      { miss: !/region|eu|europe|apac|canada|uk|country|jurisdic|cross.border|international/.test(joined),
        q: "Where will the work be performed — US, EU, APAC, mixed?" },
      { miss: !/regulat|fedramp|cmmc|far|dfars|hipaa|glba|finra|fda|ferpa|sox|public sector|federal/.test(joined),
        q: "Any regulatory regime that applies to the work — HIPAA, GLBA, FERPA, FedRAMP, CMMC, FAR/DFARS?" },
      { miss: !/insur|cyber liab|e&o|workers/.test(joined),
        q: "What insurance limits should we require — e.g. cyber liability at $1M, $5M, $10M?" },
      { miss: !/cap|liability|indemn/.test(joined),
        q: "Where should the liability cap land — 1×, 2×, or unlimited for certain carve-outs?" },
      { miss: !/super.cap|carve.out|uncapped/.test(joined),
        q: "Any liabilities we want carved out of the cap — IP indemnity, data breach, gross negligence?" },
      { miss: !/key personnel|named|background|staff|consultant|contractor|team|access/.test(joined),
        q: "Will supplier staff need access to our systems or premises?" },
      { miss: !/background.check|screen/.test(joined),
        q: "Should we require background checks on supplier personnel?" },
      { miss: !/non.solicit|hire/.test(joined),
        q: "Do we want a non-solicitation restriction on the supplier's staff?" },
      { miss: !/exit|transition|migration|portability|wind.down/.test(joined),
        q: "On exit: how long a transition-assistance period do we want — 30, 90, 180 days?" },
      { miss: !/change of control|assign|merger|acquisition/.test(joined),
        q: "Should change-of-control require our consent?" },
    ];
    const next = probes.find(p => p.miss);
    if (next) return next.q;
    if (turns < 8) return "Anything unusual about this engagement I haven't asked about — political sensitivity, audit history, board visibility?";
    return "I think I have enough to draft the manifest. Want me to proceed?";
  }

  async function handleFinalize() {
    setPhase('classifying');
    const transcript = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const result = await classifyToManifest(transcript);
    onProposeManifest(result);
    setPhase('idle');
    setTab('manifest');
  }

  const canFinalize = messages.filter(m => m.role === 'user').length >= 1;
  const empty = messages.length === 0;

  const scenarios = [
    { name:'Northwind Analytics', scope:'EU customer analytics · GDPR · production', value:'$240K', risk:'High' },
    { name:'Lumen & Brand',        scope:'Marketing campaign · no data access',       value:'$18K',  risk:'Standard' },
    { name:'Paydrive HCM',         scope:'Payroll renewal · GLBA · offshore support', value:'$480K', risk:'High' },
    { name:'Orchid AI',            scope:'White-label resale · derivative works · MFN', value:'$12M', risk:'High' },
    { name:'Pinnacle Industrial',  scope:'Hardware install · on-site · time-critical', value:'$2.1M', risk:'High' },
    { name:'Aegis FedSec',         scope:'Federal subcontract · FedRAMP · CMMC L2',    value:'$890K', risk:'High' },
    { name:'Helix Bio',            scope:'Phase-2 clinical study · HIPAA · BAA',       value:'$1.4M', risk:'High' },
    { name:'Velocity Logistics',   scope:'APAC freight · cross-border · ESG',          value:'$6M/yr', risk:'High' },
    { name:'Forge & Anvil',        scope:'T&M custom build · scope evolving · OSS',    value:'NTE $750K', risk:'High' },
    { name:'Verdant Energy',       scope:'12-yr renewables · ESG · publicity',         value:'$42M', risk:'High' },
  ];
  const scenarioText = {
    'Northwind Analytics': SAMPLE_INTAKES[0],
    'Lumen & Brand':        SAMPLE_INTAKES[1],
    'Paydrive HCM':         SAMPLE_INTAKES[2],
    'Orchid AI':            SAMPLE_INTAKES[3],
    'Pinnacle Industrial':  SAMPLE_INTAKES[4],
    'Aegis FedSec':         SAMPLE_INTAKES[5],
    'Helix Bio':            SAMPLE_INTAKES[6],
    'Velocity Logistics':   SAMPLE_INTAKES[7],
    'Forge & Anvil':        SAMPLE_INTAKES[8],
    'Verdant Energy':       SAMPLE_INTAKES[9],
  };

  if (empty) {
    return (
      <div className="h-full flex">
        {/* Left brand statement */}
        <div className="flex flex-col justify-between p-10 border-r hair" style={{width:440, background:'var(--surface)'}}>
          <div>
            <div className="section-label">Tier 1 · Intake</div>
            <h1 className="display mt-5" style={{color:'var(--ink)'}}>Describe the engagement.<br/>We'll do the rest.</h1>
            <p className="text-[14px] mt-6 leading-relaxed" style={{color:'var(--mute)', maxWidth:380}}>
              Clausewerk interviews the requester, classifies risk, and assembles a contract from pre-approved language. Pick a scenario to watch a self-interview play out — or type your own to be interviewed live.
            </p>
          </div>
          <div className="caption font-mono">{stats.clauses} clauses on file · {stats.categories} risk categories · {stats.combos} rule combinations</div>
        </div>

        {/* Right scenarios */}
        <div className="flex-1 p-10 overflow-y-auto">
          <div className="section-label mb-5">Start with a scenario</div>
          <div className="grid grid-cols-2 gap-4">
            {scenarios.map(s => (
              <button key={s.name}
                      onClick={() => runAutoInterview(s.name, scenarioText[s.name])}
                      className="text-left p-6 transition-all group"
                      style={{background:'var(--surface)', border:'1px solid var(--line)'}}
                      onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-1px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='var(--line)'; e.currentTarget.style.transform='translateY(0)'; }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="display-sm" style={{color:'var(--ink)'}}>{s.name}</div>
                  <span className={`chip ${s.risk === 'High' ? 'chip-high' : 'chip-std'}`}>{s.risk}</span>
                </div>
                <div className="text-[13px] leading-relaxed" style={{color:'var(--mute)'}}>{s.scope}</div>
                <div className="flex items-center gap-3 mt-4 pt-4 border-t" style={{borderColor:'var(--line)'}}>
                  <span className="font-mono text-[11px]" style={{color:'var(--mute-2)'}}>value</span>
                  <span className="font-mono text-[12px] tabnum">{s.value}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t hair">
            <div className="section-label mb-3">Or type your own</div>
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
                placeholder="Describe the vendor, scope, data, and value…"
                className="flex-1 px-3 py-2.5 resize-none"
                rows={2}
              />
              <button onClick={() => sendMessage(input)} disabled={!input.trim()} className="btn btn-primary self-start" style={{opacity: !input.trim() ? .4 : 1}}>
                start →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col">
        <div className="px-8 py-6 border-b hair flex items-baseline justify-between">
          <div>
            <div className="section-label">Tier 1 · Intake{autoBrief ? ` · Auto-interview · ${autoBrief.name}` : ''}</div>
            <h2 className="display-sm mt-2">Intake</h2>
          </div>
          <div className="flex items-center gap-2">
            {autoBrief && <div className="chip chip-high">Self-interview</div>}
            <div className="chip chip-std">LLM · claude-haiku-4-5</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-[10px] font-semibold"
                     style={{background:'color-mix(in oklch, var(--accent), transparent 80%)', color:'var(--accent)'}}>IN</div>
              )}
              <div className={`max-w-[70%] ${m.role === 'user' ? 'text-right' : ''}`}>
                <div className="section-label mb-1" style={{fontSize:10}}>{m.role === 'user' ? (m.synthetic ? 'Requester · synthesized' : 'Requester') : 'Intake'}{m.fallback ? ' · local' : ''}</div>
                <div className="px-4 py-2.5 text-[14px] leading-relaxed inline-block text-left"
                     style={m.role === 'user'
                       ? (m.synthetic
                           ? {background:'transparent', border:'1px dashed var(--line-2)', color:'var(--ink)'}
                           : {background:'var(--surface)', border:'1px solid var(--line-2)'})
                       : {background:'color-mix(in oklch, var(--accent), transparent 92%)', border:'1px solid color-mix(in oklch, var(--accent), transparent 70%)'}}>
                  {m.content}
                </div>
                {m.ready && (
                  <div className="mt-3">
                    <button onClick={handleFinalize} className="btn btn-primary">→ generate manifest</button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div className={`flex gap-3 ${autoStatus && messages.length > 0 && messages[messages.length-1].role === 'assistant' ? 'justify-end' : ''}`}>
              {!(autoStatus && messages.length > 0 && messages[messages.length-1].role === 'assistant') && (
                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 font-mono text-[10px] font-semibold"
                     style={{background:'color-mix(in oklch, var(--accent), transparent 80%)', color:'var(--accent)'}}>IN</div>
              )}
              <div>
                {autoStatus && <div className="section-label mb-1" style={{fontSize:10}}>{autoStatus}</div>}
                <div className="px-4 py-3 flex items-center gap-1.5"
                     style={autoStatus && messages.length > 0 && messages[messages.length-1].role === 'assistant'
                       ? {background:'transparent', border:'1px dashed var(--line-2)'}
                       : {background:'color-mix(in oklch, var(--accent), transparent 92%)'}}>
                  <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{background:'var(--accent)'}}></span>
                  <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{background:'var(--accent)'}}></span>
                  <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{background:'var(--accent)'}}></span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t hair">
          {autoBrief && thinking ? (
            <div className="flex items-center justify-between text-[12px] py-1" style={{color:'var(--mute)'}}>
              <span className="font-mono">▸ Self-interview in progress · {autoBrief.name} · do not interrupt</span>
              <span className="font-mono mute-2">claude ↔ claude</span>
            </div>
          ) : autoBrief && !thinking ? (
            <div className="flex items-center justify-between text-[12px] py-1">
              <span className="font-mono" style={{color:'var(--mute)'}}>▸ Self-interview complete · {messages.filter(m=>m.role==='user').length} answers captured</span>
              <button onClick={() => { setAutoBrief(null); }} className="btn btn-sm">take over ↵</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
                placeholder="Reply…"
                className="flex-1 px-3 py-2 resize-none"
                rows={2}
              />
              <div className="flex flex-col gap-2">
                <button onClick={() => sendMessage(input)} disabled={!input.trim() || thinking}
                        className="btn btn-primary" style={{opacity: !input.trim() || thinking ? .4 : 1}}>send ↵</button>
                {canFinalize && <button onClick={handleFinalize} className="btn">finalize →</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-[320px] border-l hair p-6 overflow-y-auto" style={{background:'var(--surface)'}}>
        <div className="section-label mb-2">Live detection</div>
        <div className="text-[12px] mb-5" style={{color:'var(--mute)'}}>Categories the Intake is picking up as you converse.</div>
        <LiveDetection messages={messages} />
      </div>
    </div>
  );
}

function LiveDetection({ messages }) {
  const text = messages.map(m => m.content).join(' ');
  const detected = useMemo(() => {
    const found = new Map();
    for (const rule of KEYWORD_RULES) {
      if (rule.test.test(text)) {
        const prev = found.get(rule.category);
        if (!prev || (rule.severity === 'High' && prev.severity !== 'High')) {
          found.set(rule.category, { severity: rule.severity, reason: rule.reason });
        }
      }
    }
    return Array.from(found.entries()).map(([category, v]) => ({ category, ...v }));
  }, [text]);

  if (detected.length === 0) {
    return <div className="p-4 text-center text-[12px]" style={{color:'var(--mute-2)', background:'var(--surface-2)'}}>No categories detected yet.</div>;
  }
  return (
    <div className="space-y-2">
      {detected.map(d => (
        <div key={d.category} className="p-3" style={{background:'var(--surface-2)'}}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-medium">{d.category}</span>
            <span className={`chip ${d.severity === 'High' ? 'chip-high' : 'chip-std'}`}>{d.severity}</span>
          </div>
          <div className="text-[11px] leading-relaxed" style={{color:'var(--mute)'}}>{d.reason}</div>
        </div>
      ))}
    </div>
  );
}

window.IntakePanel = IntakePanel;
