// R13 — Demo mode
function DemoCaption({ text }) {
  if (!text) return null;
  return <div className="demo-caption">{text}</div>;
}

// Controller used from main.jsx
function useDemoController({ setTab, setMessages, setManifest, setDecisions, setDossier, setDossierReady, setDemoFeed, setForgeAutoRun, setPhase, resetAll, setAuditLog, setPendingReview, ledger }) {
  const [running, setRunning] = useState(false);
  const [caption, setCaption] = useState('');
  const timers = useRef([]);

  function clear() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function at(ms, fn) { timers.current.push(setTimeout(fn, ms)); }
  function say(ms, text) { at(ms, () => setCaption(text)); }

  function start() {
    if (running) { stop(); return; }
    clear();
    resetAll();
    setRunning(true);
    setPhase('demo');
    setTab('intake');

    say(0,   "Step 1 — a procurement requester describes the engagement.");
    at(1800, () => setDemoFeed({ text: SAMPLE_INTAKES[0], nonce: Date.now() }));

    say(6000,  "Step 2 — Intake classifies the risks into a validated JSON manifest.");
    at(9000, async () => {
      const r = await classifyToManifest(SAMPLE_INTAKES[0]);
      setManifest(r);
      setTab('manifest');
    });

    say(12000, "The manifest is the only thing that crosses the trust boundary.");

    say(16000, "Step 3 — Forge resolves conflicts and assembles from pre-approved language.");
    at(17500, () => setTab('forge'));
    at(18500, () => setForgeAutoRun({ nonce: Date.now() }));

    say(27000, "Step 4 — Validate runs pairwise conflict rules over the assembled draft.");
    at(29000, () => setTab('validate'));

    say(33000, "Every clause traces back to a justification. Legal reviews — they don't redraft.");
    at(34500, () => setTab('dossier'));

    say(39000, "Step 5 — Vendor redlines arrive. The AI points to a clause ID, python inserts the text.");
    at(41000, () => setTab('negotiate'));

    say(46000, "A reviewer edits a suggestion. It files for Legal verification before joining the library.");
    at(48000, () => {
      // Seed a pending-review item so the queue is populated for demo
      setPendingReview(prev => [...prev, {
        id: 'DP-PEND-417',
        cat: 'Data Privacy',
        sev: 'High',
        title: 'Human-edited · Breach notification (72h with 24h trigger for PHI)',
        text: 'Licensor shall notify Controller within seventy-two (72) hours of any Personal Data Breach; provided that where the breach involves Protected Health Information, Licensor shall notify Controller within twenty-four (24) hours, consistent with 45 CFR §164.410 and Cyber-Insurance-Rider E-7.',
        sourceRedline: 'RL-2026-0418',
        sourceVendor: 'Northwind Analytics',
        submittedBy: 'A. Delacroix · Procurement',
        submittedAt: new Date().toISOString(),
        status: 'pending',
      }]);
      // Seed audit entries
      setAuditLog(prev => [...prev,
        { ts: new Date().toISOString(), actor: 'controller', type: 'ai_suggest', vendor: 'Northwind Analytics', redline: 'RL-2026-0418', clause_id: 'DP-H-014', score: 0.924 },
        { ts: new Date(Date.now()+1200).toISOString(), actor: 'human', type: 'human_edit_submit', vendor: 'Northwind Analytics', redline: 'RL-2026-0418', pending_id: 'DP-PEND-417' },
      ]);
      setTab('review');
    });

    say(52000, "Step 6 — Legal verifies the edit. Every decision sits in audit_log.db.");
    at(54000, () => setTab('audit'));

    say(58000, "Five risks. Five clauses. Vendor redline resolved. Zero LLM-authored characters shipped.");
    at(63000, () => { setCaption(''); setRunning(false); setPhase('idle'); setTab('intake'); });
  }

  function stop() {
    clear();
    setRunning(false);
    setCaption('');
    setPhase('idle');
  }

  return { running, caption, start, stop };
}

window.DemoCaption = DemoCaption;
window.useDemoController = useDemoController;
