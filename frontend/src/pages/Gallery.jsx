import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_KEY, deleteRun, getGallery, publishRun } from '../api';
import { Stamp } from '../components.jsx';

export default function Gallery() {
  const isAdmin = !!localStorage.getItem(ADMIN_KEY);
  const [rows, setRows] = useState(null);      // null = never loaded
  const [showAll, setShowAll] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [busy, setBusy] = useState(null);      // slug mid-action
  const reqRef = useRef(0);

  /** Stale-while-revalidate: existing rows stay on screen (dimmed) while the
   * next scope loads, then swap in place. The request id guard means a slow
   * response from a superseded toggle can never overwrite a newer one. */
  const load = useCallback(async (all) => {
    const id = ++reqRef.current;
    setUpdating(true);
    try {
      const d = await getGallery(all);
      if (reqRef.current === id) setRows(d.runs);
    } catch {
      if (reqRef.current === id) setRows((r) => r ?? []);
    } finally {
      if (reqRef.current === id) setUpdating(false);
    }
  }, []);

  useEffect(() => {
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

  // Only the very first visit has nothing to show.
  if (rows === null)
    return <div className="status-line"><span className="dot" />Opening the docket…</div>;

  return (
    <>
      <div className="hero" style={{ margin: '32px 0 8px' }}>
        <h1 style={{ fontSize: 32 }}>The docket</h1>
        <p>Sessions their founders chose to publish.</p>
      </div>

      {isAdmin && (
        <div className="scope-seg" role="tablist" aria-label="Docket scope">
          <button
            role="tab"
            aria-selected={!showAll}
            className={`seg${!showAll ? ' on' : ''}`}
            onClick={() => setShowAll(false)}
          >
            Public docket
          </button>
          <button
            role="tab"
            aria-selected={showAll}
            className={`seg${showAll ? ' on' : ''}`}
            onClick={() => setShowAll(true)}
          >
            All sessions
          </button>
        </div>
      )}

      {rows.length === 0 && !updating && (
        <div className="empty-docket">
          <span className="empty-stamp">Docket clear</span>
          <p className="empty-title">
            {showAll ? 'No sessions in the record.' : 'No published rulings yet.'}
          </p>
          <p className="empty-sub">
            {showAll
              ? 'Every session ever run appears in this view \u2014 unlisted, failed, and in-flight included.'
              : 'Run an idea through the tribunal, then choose to publish the ruling. The first case on the record could be yours.'}
          </p>
          {!showAll && (
            <Link to="/new" className="btn">Put an idea on trial &rarr;</Link>
          )}
        </div>
      )}

      <div className={`docket-list${updating ? ' updating' : ''}`} aria-busy={updating}>
        {rows.map((r, i) => {
          const v = r.verdicts?.[0] || r.verdicts;
          return (
            <Link
              className="gallery-row"
              to={`/r/${r.share_slug}`}
              key={r.share_slug}
              style={{ animationDelay: `${Math.min(i * 45, 280)}ms` }}
            >
              <div className="g-idea">{r.idea_refined || r.idea_raw}</div>
              {v && (
                <div className="g-verdict">
                  {v.conviction && <Stamp conviction={v.conviction} mini />}
                  {v.headline}
                </div>
              )}
              <div className="g-meta">
                <span>
                  {new Date(r.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {showAll && r.status !== 'complete' && (
                  <span className={`state-chip ${r.status === 'failed' ? 'bad' : ''}`}>
                    {r.status}
                  </span>
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
      </div>
    </>
  );
}