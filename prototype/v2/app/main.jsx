// Main orchestrator
function ClausewerkApp() {
  const [tab, setTab] = useState('intake');
  const [phase, setPhase] = useState('idle');

  const [messages, setMessages] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [ledger, setLedger] = useState(INITIAL_LEDGER);
  const [decisions, setDecisions] = useState([]);
  const [dossier, setDossier] = useState(null);
  const [dossierReady, setDossierReady] = useState(false);

  const [showIntro, setShowIntro] = useState(false);
  const [demoFeed, setDemoFeed] = useState(null);
  const [forgeAutoRun, setForgeAutoRun] = useState(null);

  function onProposeManifest(m) {
    setManifest(m);
    setDecisions([]);
    setDossier(null);
    setDossierReady(false);
  }

  function resetAll() {
    setMessages([]);
    setManifest(null);
    setDecisions([]);
    setDossier(null);
    setDossierReady(false);
    setTab('intake');
  }

  function onReset() {
    if (!confirm('Reset the entire session? (Ledger preserved.)')) return;
    resetAll();
  }

  const demo = useDemoController({
    setTab, setMessages, setManifest, setDecisions, setDossier, setDossierReady,
    setDemoFeed, setForgeAutoRun, setPhase, resetAll,
  });

  // First-run intro
  useEffect(() => {
    try {
      const seen = localStorage.getItem('clausewerk.seen');
      if (!seen) { setShowIntro(true); localStorage.setItem('clausewerk.seen', '1'); }
    } catch(e){}
  }, []);

  // Persistence — v2 schema (post-expansion to 76 clauses). Old v1 keys ignored.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('clausewerk.v2') || '{}');
      if (saved.ledger) setLedger(saved.ledger);
    } catch(e) {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('clausewerk.v2', JSON.stringify({ ledger })); } catch(e) {}
  }, [ledger]);

  return (
    <>
      <Shell active={tab} setActive={setTab} phase={phase}
             manifest={manifest} decisions={decisions} dossierReady={dossierReady}
             onReset={onReset} onDemo={demo.start} demoRunning={demo.running}
             onArchitecture={() => setShowIntro(true)} ledger={ledger}>
        <div className="h-full" style={{position:'relative'}} data-screen-label={tab}>
          {tab === 'intake' && (
            <IntakePanel messages={messages} setMessages={setMessages}
                         onProposeManifest={onProposeManifest} setPhase={setPhase}
                         manifest={manifest} setTab={setTab} demoFeed={demoFeed} ledger={ledger}/>
          )}
          {tab === 'manifest' && (
            <ManifestPanel manifest={manifest} setManifest={setManifest} setTab={setTab} setPhase={setPhase}/>
          )}
          {tab === 'ledger' && (
            <LedgerPanel ledger={ledger} setLedger={setLedger}/>
          )}
          {tab === 'forge' && (
            <ForgePanel manifest={manifest} ledger={ledger}
                        decisions={decisions} setDecisions={setDecisions}
                        setDossier={setDossier} setTab={setTab} setPhase={setPhase}
                        setDossierReady={setDossierReady} autoRun={forgeAutoRun}/>
          )}
          {tab === 'dossier' && (
            <DossierPanel manifest={manifest} decisions={decisions} dossier={dossier} setTab={setTab}/>
          )}
        </div>
      </Shell>
      {showIntro && <ArchitectureIntro onClose={() => setShowIntro(false)}/>}
      <DemoCaption text={demo.caption}/>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ClausewerkApp />);
