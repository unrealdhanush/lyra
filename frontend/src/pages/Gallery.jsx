import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGallery } from '../api';
import { Stamp } from '../components.jsx';

export default function Gallery() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    getGallery().then((d) => setRows(d.runs)).catch(() => setRows([]));
  }, []);

  if (!rows) return <div className="status-line">Opening the docket…</div>;

  return (
    <>
      <div className="hero" style={{ margin: '32px 0 8px' }}>
        <h1 style={{ fontSize: 32 }}>The docket</h1>
        <p>Sessions their founders chose to publish.</p>
      </div>
      {rows.length === 0 && (
        <p style={{ color: 'var(--ink-2)' }}>Nothing on the docket yet. Yours could be first.</p>
      )}
      {rows.map((r) => {
        const v = r.verdicts?.[0] || r.verdicts;
        return (
          <Link className="gallery-row" to={`/r/${r.share_slug}`} key={r.share_slug}>
            <div className="g-idea">{r.idea_refined || r.idea_raw}</div>
            {v && (
              <div className="g-verdict">
                {v.conviction && <Stamp conviction={v.conviction} mini />}
                {v.headline}
              </div>
            )}
            <div className="g-meta">{new Date(r.created_at).toLocaleDateString()}</div>
          </Link>
        );
      })}
    </>
  );
}
