// V3 — Main orchestrator with Negotiate + Validate + Review + Audit
function ClausewerkApp() {
  const [tab, setTab] = useState('intake');
  const [phase, setPhase] = useState('idle');

  const [messages, setMessages] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [rawLedger, setRawLedger] = useState([...INITIAL_LEDGER, ...(window.BASELINE_LEDGER || [])]);
  const [decisions, setDecisions] = useState([]);
  const [dossier, setDossier] = useState(null);
  const [dossierReady, setDossierReady] = useState(false);

  // V3 new state
  const [auditLog, setAuditLog] = useState([]);
  const [pendingReview, setPendingReview] = useState([]);
  const [conflictFindings, setConflictFindings] = useState([]);
  const [conflictAck, setConflictAck] = useState(false);
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "similarityThreshold": 0.78,
    "strictMode": true,
    "autoApprove": false,
    "showTrace": true,
    "density": "comfortable"
  }/*EDITMODE-END*/);

  // Enrich ledger with V3 metadata on every change
  const ledger = useMemo(() => enrichLedger(rawLedger), [rawLedger]);
  const setLedger = (fnOrVal) => {
    setRawLedger(prev => typeof fnOrVal === 'function' ? fnOrVal(prev) : fnOrVal);
  };

  const [showIntro, setShowIntro] = useState(false);
  const [demoFeed, setDemoFeed] = useState(null);
  const [forgeAutoRun, setForgeAutoRun] = useState(null);

  function onProposeManifest(m) {
    setManifest(m);
    setDecisions([]);
    setDossier(null);
    setDossierReady(false);
    setConflictFindings([]);
    setConflictAck(false);
  }

  function resetAll() {
    setMessages([]);
    setManifest(null);
    setDecisions([]);
    setDossier(null);
    setDossierReady(false);
    setConflictFindings([]);
    setConflictAck(false);
    setTab('intake');
  }

  function onReset() {
    if (!confirm('Reset the session? (Ledger + audit log preserved.)')) return;
    setMessages([]); setManifest(null); setDecisions([]); setDossier(null); setDossierReady(false); setConflictFindings([]); setConflictAck(false); setTab('intake');
  }

  // Re-run conflict validation whenever decisions change
  useEffect(() => {
    if (!decisions || decisions.length === 0) { setConflictFindings([]); return; }
    setConflictFindings(runConflictValidation(decisions));
  }, [decisions]);

  const demo = useDemoController({
    setTab, setMessages, setManifest, setDecisions, setDossier, setDossierReady,
    setDemoFeed, setForgeAutoRun, setPhase, resetAll,
    setAuditLog, setPendingReview, ledger,
  });

  // First-run intro
  useEffect(() => {
    try {
      const seen = localStorage.getItem('clausewerk.v3.seen');
      if (!seen) { setShowIntro(true); localStorage.setItem('clausewerk.v3.seen', '1'); }
    } catch(e){}
  }, []);

  // Persistence — v3 schema
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('clausewerk.v3.1') || '{}');
      if (saved.ledger) setRawLedger(saved.ledger);
      if (saved.auditLog) setAuditLog(saved.auditLog);
      if (saved.pendingReview) setPendingReview(saved.pendingReview);
    } catch(e) {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('clausewerk.v3.1', JSON.stringify({ ledger: rawLedger, auditLog, pendingReview })); } catch(e) {}
  }, [rawLedger, auditLog, pendingReview]);

  // Tweaks panel handles its own open/close via the protocol listener.

  const pendingCount = pendingReview.filter(p => p.status === 'pending').length;

  return (
    <>
      <Shell active={tab} setActive={setTab} phase={phase}
             manifest={manifest} decisions={decisions} dossierReady={dossierReady}
             onReset={onReset} onDemo={demo.start} demoRunning={demo.running}
             onArchitecture={() => setShowIntro(true)} ledger={ledger}
             conflictCount={conflictFindings.length}
             pendingCount={pendingCount}
             auditCount={auditLog.length}>
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
            <LedgerPanel ledger={ledger} setLedger={setLedger} tweaks={tweaks}/>
          )}
          {tab === 'forge' && (
            <ForgePanel manifest={manifest} ledger={ledger}
                        decisions={decisions} setDecisions={setDecisions}
                        setDossier={setDossier} setTab={setTab} setPhase={setPhase}
                        setDossierReady={setDossierReady} autoRun={forgeAutoRun}
                        conflictFindings={conflictFindings} conflictAck={conflictAck}
                        tweaks={tweaks}/>
          )}
          {tab === 'validate' && (
            <ValidatePanel manifest={manifest} decisions={decisions}
                           findings={conflictFindings} setTab={setTab}
                           onAcknowledge={() => setConflictAck(true)}
                           acknowledged={conflictAck}/>
          )}
          {tab === 'dossier' && (
            <DossierPanel manifest={manifest} decisions={decisions} dossier={dossier} setTab={setTab}
                          conflictFindings={conflictFindings}/>
          )}
          {tab === 'negotiate' && (
            <NegotiatePanel ledger={ledger} manifest={manifest} decisions={decisions}
                            auditLog={auditLog} setAuditLog={setAuditLog}
                            pendingReview={pendingReview} setPendingReview={setPendingReview}
                            tweaks={tweaks}/>
          )}
          {tab === 'review' && (
            <ReviewQueuePanel pendingReview={pendingReview} setPendingReview={setPendingReview}
                              setLedger={setLedger}/>
          )}
          {tab === 'audit' && (
            <AuditLogPanel auditLog={auditLog} tweaks={tweaks}/>
          )}
        </div>
      </Shell>
      {showIntro && <ArchitectureIntro onClose={() => setShowIntro(false)}/>}
      <DemoCaption text={demo.caption}/>
      <TweaksPanel title="Tweaks">
        <TweakSection label="AI controller"/>
        <TweakSlider label="Similarity threshold" value={tweaks.similarityThreshold} min={0.50} max={0.95} step={0.01}
                     onChange={(v) => setTweak('similarityThreshold', v)}/>
        <TweakToggle label="Strict mode (Active clauses only)" value={tweaks.strictMode} onChange={(v) => setTweak('strictMode', v)}/>
        <TweakToggle label="Auto-approve ≥ 0.90 similarity" value={tweaks.autoApprove} onChange={(v) => setTweak('autoApprove', v)}/>
        <TweakToggle label="Show controller trace" value={tweaks.showTrace} onChange={(v) => setTweak('showTrace', v)}/>
        <TweakSection label="View"/>
        <TweakRadio label="Density" value={tweaks.density} options={[{value:'comfortable',label:'comfortable'},{value:'compact',label:'compact'}]}
                    onChange={(v) => setTweak('density', v)}/>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ClausewerkApp />);
