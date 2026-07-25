// R12 — Architecture intro overlay
function ArchitectureIntro({ onClose, compact }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 400),
      setTimeout(() => setStage(2), 1100),
      setTimeout(() => setStage(3), 2000),
      setTimeout(() => setStage(4), 3000),
      setTimeout(() => setStage(5), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="relative" style={{width: 720, height: 480}}>
        <svg viewBox="0 0 720 480" className="w-full h-full">
          {/* Intake */}
          <g opacity={stage >= 1 ? 1 : 0} style={{transition:'opacity .5s'}}>
            <Slab x={90} y={90} w={540} h={48} label="INTAKE" sub="LLM · conversational"/>
          </g>
          {/* Ledger */}
          <g opacity={stage >= 2 ? 1 : 0} style={{transition:'opacity .5s'}}>
            <Slab x={90} y={210} w={540} h={48} label="LEDGER" sub="SharePoint · pre-approved clauses"/>
          </g>
          {/* Forge */}
          <g opacity={stage >= 3 ? 1 : 0} style={{transition:'opacity .5s'}}>
            <Slab x={90} y={330} w={540} h={48} label="FORGE" sub="Python · deterministic assembly"/>
          </g>
          {/* JSON packet */}
          {stage >= 4 && (
            <g>
              <rect x="330" y="148" width="60" height="20" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1">
                <animate attributeName="y" from="148" to="320" dur="1s" fill="freeze"/>
              </rect>
              <text x="360" y="162" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="var(--accent)">
                manifest
                <animate attributeName="y" from="162" to="334" dur="1s" fill="freeze"/>
              </text>
            </g>
          )}
          {/* Clause IDs */}
          {stage >= 4 && (
            <g>
              {['DP-H-014','ID-H-007','IP-S-002'].map((id, i) => (
                <g key={id}>
                  <rect x={150 + i*80} y="270" width="66" height="16" fill="var(--surface)" stroke="var(--accent)" strokeWidth=".8">
                    <animate attributeName="y" from="270" to="326" dur="1.2s" begin={`${.2*i}s`} fill="freeze"/>
                  </rect>
                  <text x={183 + i*80} y="281" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--accent)">{id}
                    <animate attributeName="y" from="281" to="337" dur="1.2s" begin={`${.2*i}s`} fill="freeze"/>
                  </text>
                </g>
              ))}
            </g>
          )}
          {/* Dossier */}
          {stage >= 5 && (
            <g>
              <rect x="580" y="400" width="32" height="44" fill="#F5F1E8" stroke="var(--accent)" strokeWidth="1">
                <animate attributeName="y" from="390" to="410" dur=".6s" fill="freeze"/>
              </rect>
              <text x="596" y="452" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8" fill="var(--mute)">.docx</text>
            </g>
          )}
        </svg>
        <div className="absolute top-0 left-0 right-0 text-center">
          <div className="display-sm">The Clausewerk architecture</div>
          <div className="section-label mt-1">Three tiers · one trust boundary · one audit trail</div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 text-center">
          <div className="font-mono text-[11px]" style={{color:'var(--mute-2)'}}>press any key to continue</div>
        </div>
      </div>
    </div>
  );
}

function Slab({ x, y, w, h, label, sub }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--surface)" stroke="var(--line-2)" strokeWidth="1"/>
      <text x={x+16} y={y+h/2+5} fontFamily="Inter" fontSize="13" fontWeight="600" fill="var(--ink)" letterSpacing="1">{label}</text>
      <text x={x+w-16} y={y+h/2+5} fontFamily="JetBrains Mono" fontSize="10" textAnchor="end" fill="var(--mute)">{sub}</text>
    </g>
  );
}

window.ArchitectureIntro = ArchitectureIntro;
