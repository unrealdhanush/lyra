import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Submit from './pages/Submit.jsx';
import Run from './pages/Run.jsx';
import Gallery from './pages/Gallery.jsx';
import Bench from './pages/Bench.jsx';
import { ADMIN_KEY } from './api';

/** Visit /?admin=<token> once to enable unlimited runs in this browser;
 * /?admin=off to disable. The token is stripped from the URL immediately
 * so it never lingers in the address bar or gets shared by accident. */
function useAdmin() {
  const [admin, setAdmin] = useState(() => !!localStorage.getItem(ADMIN_KEY));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('admin');
    if (t === null) return;
    if (t === 'off') localStorage.removeItem(ADMIN_KEY);
    else localStorage.setItem(ADMIN_KEY, t);
    setAdmin(t !== 'off');
    params.delete('admin');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  const clear = () => {
    localStorage.removeItem(ADMIN_KEY);
    setAdmin(false);
  };

  return { admin, clear };
}

/* Reading pages get a text measure; the landing uses the full canvas. */
const Measure = ({ children }) => <div className="measure">{children}</div>;

export default function App() {
  const { admin, clear } = useAdmin();
  return (
    <>
      {/* Full-bleed sticky chrome; only its CONTENTS are constrained. */}
      <header className="masthead">
        <div className="masthead-inner">
          <Link to="/" className="wordmark">
            <span className="seal" />LYRA
          </Link>
          <nav>
            {admin && (
              <button
                className="admin-chip"
                onClick={clear}
                title="Admin mode: unlimited runs. Click to sign out."
              >
                admin
              </button>
            )}
            {admin && <Link to="/admin">bench</Link>}
            <Link to="/docket">DOCKET</Link>
            {/* <a href="https://github.com/unrealdhanush/lyra" target="_blank" rel="noreferrer">source</a> */}
          </nav>
        </div>
      </header>

      <main className="shell">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/new" element={<Measure><Submit /></Measure>} />
          <Route path="/r/:slug" element={<Measure><Run /></Measure>} />
          <Route path="/docket" element={<Measure><Gallery /></Measure>} />
          <Route path="/admin" element={<Measure><Bench /></Measure>} />
        </Routes>
      </main>
    </>
  );
}
