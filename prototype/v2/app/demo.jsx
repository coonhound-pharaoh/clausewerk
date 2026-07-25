// R13 — Demo mode
function DemoCaption({ text }) {
  if (!text) return null;
  return <div className="demo-caption">{text}</div>;
}

// Controller used from main.jsx
function useDemoController({ setTab, setMessages, setManifest, setDecisions, setDossier, setDossierReady, setDemoFeed, setForgeAutoRun, setPhase, resetAll }) {
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

    say(27000, "Every clause traces back to a justification. Legal reviews — they don't redraft.");
    at(28500, () => setTab('dossier'));

    say(34000, "Five risks. Five clauses. Zero LLM-authored characters.");
    at(38000, () => { setCaption(''); setRunning(false); setPhase('idle'); });
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
