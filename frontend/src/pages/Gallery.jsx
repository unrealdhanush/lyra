import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_KEY, deleteRun, getGallery, publishRun } from '../api';
import { Stamp } from '../components.jsx';

export default function Gallery() {
  const isAdmin = !!localStorage.getItem(ADMIN_KEY);
  const [rows, setRows] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(null); // slug currently being acted on

  const load = useCallback(
    (all) =>
      getGallery(all)
        .then((d) => setRows(d.runs))
        .catch(() => setRows([])),
    []
  );

  useEffect(() => {
    setRows(null);
    load(showAll);
  }, [showAll, load]);

  // Buttons live inside a <Link>; without these the click also navigates.
  async function unlist(e, slug) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(slug);
    try {
      await publishRun(slug, false);
      await load(showAll);
    } finally {
      setBusy(null);
    }
  }

  async function destroy(e, slug) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `Delete session ${slug}?\n\nThis permanently removes the run, its verdict, and its share link. It cannot be undone.`
    );
    if (!ok) return;
    setBusy(slug);
    try {
      await deleteRun(slug);
      await load(showAll);
    } finally {
      setBusy(null);
    }
  }

  if (!rows) return <div className="status-line"><span className="dot" />Opening the docket…</div>;

  return (
    <>
      <div className="hero" style={{ margin: '32px 0 8px' }}>
        <h1 style={{ fontSize: 32 }}>The docket</h1>
        <p>Sessions their founders chose to publish.</p>
      </div>

      {isAdmin && (
        <div className="docket-tools">
          <button
            className={`scope-btn${!showAll ? ' on' : ''}`}
            onClick={() => setShowAll(false)}
          >
            public docket
          </button>
          <button
            className={`scope-btn${showAll ? ' on' : ''}`}
            onClick={() => setShowAll(true)}
          >
            all sessions
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <p style={{ color: 'var(--ink-2)' }}>
          {showAll ? 'No sessions at all yet.' : 'Nothing on the docket yet. Yours could be first.'}
        </p>
      )}

      {rows.map((r, i) => {
        const v = r.verdicts?.[0] || r.verdicts;
        return (
          <Link
            className="gallery-row"
            to={`/r/${r.share_slug}`}
            key={r.share_slug}
            style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}
          >
            <div className="g-idea">{r.idea_refined || r.idea_raw}</div>
            {v && (
              <div className="g-verdict">
                {v.conviction && <Stamp conviction={v.conviction} mini />}
                {v.headline}
              </div>
            )}
            <div className="g-meta">
              {new Date(r.created_at).toLocaleDateString()}
              {showAll && r.status !== 'complete' && (
                <span className={`state-chip ${r.status === 'failed' ? 'bad' : ''}`}>{r.status}</span>
              )}
              {showAll && !r.is_public && <span className="state-chip">unlisted</span>}
            </div>
            {isAdmin && (
              <div className="row-actions">
                {r.is_public && (
                  <button
                    className="icon-btn"
                    disabled={busy === r.share_slug}
                    onClick={(e) => unlist(e, r.share_slug)}
                    aria-label="Unlist from the public docket"
                    data-tip="Unlist — off the docket, link keeps working"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  </button>
                )}
                <button
                  className="icon-btn danger"
                  disabled={busy === r.share_slug}
                  onClick={(e) => destroy(e, r.share_slug)}
                  aria-label="Delete session permanently"
                  data-tip="Delete — permanent, kills the share link"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            )}
          </Link>
        );
      })}
    </>
  );
}
