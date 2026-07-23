import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_KEY, getModelCatalog, getRoster, resetRoster, saveRoster } from '../api';
import { ROLE_META } from '../components.jsx';

const SEATS = [
  ...Object.entries(ROLE_META).map(([id, m]) => ({ id, title: m.title, charge: m.q ?? m.charge })),
  { id: 'chairman', title: 'The Chair', charge: 'Synthesizes the ruling — the one seat worth a strong model.' },
  { id: 'preflight', title: 'Pre-flight', charge: 'Screens ideas before a session is spent. Cheapest seat in the house.' },
];

const SLOTS = 3;

export default function Bench() {
  const isAdmin = !!localStorage.getItem(ADMIN_KEY);
  const [roster, setRoster] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [error, setError] = useState(null);

  const known = useMemo(() => new Set(catalog), [catalog]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([getRoster(), getModelCatalog()])
      .then(([r, m]) => {
        setRoster(r.active);
        setDefaults(r.defaults);
        setCatalog(m.models);
      })
      .catch((e) => setError(e.message));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="error-note">
        The bench is admin-only. Activate admin mode first, then return here.
      </div>
    );
  }

  function setSlot(seat, i, value) {
    setNote(null);
    setRoster((r) => {
      const chain = [...(r[seat] || [])];
      chain[i] = value;
      return { ...r, [seat]: chain };
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const clean = Object.fromEntries(
        Object.entries(roster).map(([seat, chain]) => [
          seat,
          chain.filter((m) => m && m.trim()),
        ])
      );
      const res = await saveRoster(clean);
      setRoster(res.active);
      setNote('Saved. Applies from the next session — no redeploy.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await resetRoster();
      setRoster(res.active);
      setNote('Reset to code defaults.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !roster) return <div className="error-note">{error}</div>;
  if (!roster) return <div className="status-line"><span className="dot" />Opening the bench…</div>;

  return (
    <>
      <div className="submit-head">
        <Link to="/" className="back-link">&larr; LYRA</Link>
        <h1>The bench</h1>
        <p>
          Who sits in each seat. Options come from OpenRouter's live catalog, and
          saves are validated against it — a model ID that doesn't exist can't be
          seated. Changes apply from the next session; nothing to redeploy.
        </p>
      </div>

      <datalist id="model-catalog">
        {catalog.map((m) => <option value={m} key={m} />)}
      </datalist>

      {SEATS.map((s) => (
        <div className="bench-seat" key={s.id}>
          <div className="bench-head">
            <span className="adv-role">{s.title}</span>
            <span className="bench-charge">{s.charge}</span>
          </div>
          <div className="bench-slots">
            {Array.from({ length: SLOTS }).map((_, i) => {
              const val = roster[s.id]?.[i] || '';
              const ok = !val || known.has(val);
              return (
                <div className="slot" key={i}>
                  <span className="slot-label">{i === 0 ? 'primary' : `fallback ${i}`}</span>
                  <input
                    type="text"
                    list="model-catalog"
                    value={val}
                    placeholder={i === 0 ? 'required' : 'optional'}
                    onChange={(e) => setSlot(s.id, i, e.target.value)}
                    className={ok ? '' : 'slot-bad'}
                  />
                  {val && (
                    <span className={`slot-mark ${ok ? 'ok' : 'bad'}`}>
                      {ok ? '\u2713' : 'not in catalog'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {defaults?.[s.id] && (
            <div className="bench-default">default: {defaults[s.id].join(' \u2192 ')}</div>
          )}
        </div>
      ))}

      {error && <div className="error-note">{error}</div>}
      {note && <div className="bench-note">{note}</div>}

      <div style={{ marginTop: 8 }}>
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Seat the bench'}
        </button>{' '}
        <button className="btn btn-quiet" onClick={reset} disabled={busy}>
          Reset to defaults
        </button>
      </div>
    </>
  );
}
