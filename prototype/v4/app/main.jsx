// The root. Sign-in, or a workspace.

const { useState, useEffect, useCallback } = React;

function App() {
  const [identity, setIdentity] = useState(null);
  // The address bar is the router. Deep links matter here for a reason beyond
  // convenience: the acceptance test types another role's address directly, and
  // a shell with no addressable routes could not be tested for the thing that
  // matters most about it.
  const [tab, setTab] = useState(() => window.location.hash.replace(/^#\/?/, '') || null);

  useEffect(() => {
    const onHash = () => setTab(window.location.hash.replace(/^#\/?/, '') || null);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((key) => {
    window.location.hash = `#/${key}`;
    setTab(key);
  }, []);

  const onSignedIn = useCallback((who) => {
    setIdentity(who);
    // Land on the first tab of this role's workspace — "what is waiting on you"
    // — unless the address already names one. Somebody following a link to a
    // pane they may not open still gets the refusal state rather than a
    // silent redirect, because being told is more use than being moved.
    const current = window.location.hash.replace(/^#\/?/, '');
    go(current || WORKSPACES[who.role].tabs[0].key);
  }, [go]);

  const onSignOut = useCallback(async () => {
    await API.signOut();
    setIdentity(null);
    window.location.hash = '';
  }, []);

  // A session that has expired, or a person who has been revoked, comes back as
  // a 401 from whatever they next touch. The honest response is the front door:
  // leaving a workspace on screen that can no longer load anything would be a
  // surface claiming access that is gone.
  useEffect(() => {
    if (!identity) return;
    const check = async () => {
      const r = await API.me();
      if (!r.ok && r.expired) { API.forget(); setIdentity(null); }
    };
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [identity]);

  if (!identity) return <SignIn onSignedIn={onSignedIn} />;

  const active = tab || WORKSPACES[identity.role].tabs[0].key;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <Masthead identity={identity} onSignOut={onSignOut} />
      <Tabs role={identity.role} active={active} onSelect={go} />
      <div className="flex-1 overflow-auto px-6 py-6" data-testid="workspace">
        <Workspace role={identity.role} tab={active} />
      </div>
      <Footer
        identity={identity}
        note="Every pane here is fed by an endpoint your role can actually read."
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
