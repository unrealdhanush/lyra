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
                    className="mini-btn"
                    disabled={busy === r.share_slug}
                    onClick={(e) => unlist(e, r.share_slug)}
                    title="Remove from the public docket. The owner keeps their link."
                  >
                    Unlist
                  </button>
                )}
                <button
                  className="mini-btn danger"
                  disabled={busy === r.share_slug}
                  onClick={(e) => destroy(e, r.share_slug)}
                  title="Delete the session entirely. The share link dies."
                >
                  Delete
                </button>
              </div>
            )}
          </Link>
        );
      })}
    </>
  );
}