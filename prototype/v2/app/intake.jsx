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
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  // Allow demo mode to push messages in
  useEffect(() => {
    if (demoFeed && demoFeed.text) {
      sendMessage(demoFeed.text);
    }
  }, [demoFeed?.nonce]);

  async function sendMessage(text) {
    if (!text.trim() || thinking) return;
    const userMsg = { role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setThinking(true);
    setPhase('thinking');

    try {
      const convo = next.map(m => `${m.role === 'user' ? 'Requester' : 'Intake'}: ${m.content}`).join('\n');
      const prompt = `You are the Intake agent for a contract assembly system. Conduct a short, focused procurement interview — 2 to 4 probing questions total. Do NOT draft legal language. Focus on: vendor name, contract value, data processed (especially regulated/PII), jurisdictions, subcontracting, mission-criticality.

When you have enough, respond with exactly this token on its own line:
READY_FOR_MANIFEST

Otherwise respond with ONE concise clarifying question.

Conversation so far:
${convo}

Your next turn:`;
      const reply = (await window.claude.complete(prompt)).trim();
      if (reply.includes('READY_FOR_MANIFEST')) {
        const closing = reply.replace(/READY_FOR_MANIFEST/g, '').trim() || "Got it — I have enough to draft the manifest.";
        setMessages([...next, { role: 'assistant', content: closing, ready: true }]);
      } else {
        setMessages([...next, { role: 'assistant', content: reply }]);
      }
    } catch (e) {
      const q = pickFallbackQuestion(next);
      setMessages([...next, { role: 'assistant', content: q, fallback: true }]);
    } finally {
      setThinking(false);
      setPhase('idle');
    }
  }

  function pickFallbackQuestion(conv) {
    const joined = conv.map(m => m.content).join(' ').toLowerCase();
    if (!/\$|\bspend|\bvalue|\bmillion|\bthousand|\bk\b/.test(joined)) return "What's the annual contract value, roughly?";
    if (!/data|pii|gdpr|customer|employee|personal/.test(joined)) return "Does the vendor handle any of your customer or employee data?";
    if (!/region|eu|europe|us|canada|country|jurisdic/.test(joined)) return "Which jurisdictions are in scope — US only, or cross-border?";
    if (!/subcontract|third party|offshore/.test(joined)) return "Will the vendor use subcontractors or offshore teams?";
    return "I think I have enough. Want me to draft the manifest?";
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
    { name:'Northwind Analytics', scope:'EU customer analytics · production workload', value:'$240K', risk:'High' },
    { name:'Lumen & Brand',        scope:'One-off marketing campaign · no data access', value:'$18K', risk:'Standard' },
    { name:'Paydrive HCM',         scope:'Payroll SaaS renewal · PII · offshore teams', value:'$480K', risk:'High' },
    { name:'Orchid AI',            scope:'White-label resale · derivative works',      value:'$120K', risk:'High' },
  ];
  const scenarioText = {
    'Northwind Analytics': SAMPLE_INTAKES[0],
    'Lumen & Brand':        SAMPLE_INTAKES[1],
    'Paydrive HCM':         SAMPLE_INTAKES[2],
    'Orchid AI':            SAMPLE_INTAKES[3],
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
              Clausewerk interviews the requester, classifies risk, and assembles a contract from pre-approved language. Pick a scenario — or type your own.
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
                      onClick={() => sendMessage(scenarioText[s.name])}
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
            <div className="section-label">Tier 1 · Intake</div>
            <h2 className="display-sm mt-2">Intake</h2>
          </div>
          <div className="chip chip-std">LLM · claude-haiku-4-5</div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-5 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 mt-0.5 font-mono text-[10px] font-semibold"
                     style={{background:'color-mix(in oklch, var(--accent), transparent 80%)', color:'var(--accent)'}}>IN</div>
              )}
              <div className={`max-w-[70%] ${m.role === 'user' ? 'text-right' : ''}`}>
                <div className="section-label mb-1" style={{fontSize:10}}>{m.role === 'user' ? 'Requester' : 'Intake'}{m.fallback ? ' · local' : ''}</div>
                <div className="px-4 py-2.5 text-[14px] leading-relaxed inline-block text-left"
                     style={m.role === 'user'
                       ? {background:'var(--surface)', border:'1px solid var(--line-2)'}
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
            <div className="flex gap-3">
              <div className="w-7 h-7 flex items-center justify-center flex-shrink-0 font-mono text-[10px] font-semibold"
                   style={{background:'color-mix(in oklch, var(--accent), transparent 80%)', color:'var(--accent)'}}>IN</div>
              <div className="px-4 py-3 flex items-center gap-1.5"
                   style={{background:'color-mix(in oklch, var(--accent), transparent 92%)'}}>
                <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{background:'var(--accent)'}}></span>
                <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{background:'var(--accent)'}}></span>
                <span className="w-1.5 h-1.5 rounded-full typing-dot" style={{background:'var(--accent)'}}></span>
              </div>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t hair">
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
