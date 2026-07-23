import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRun, publishRun } from '../api';
import { AdvisorRow, Pipeline, ROLE_META, ROLE_ORDER, Stamp, fmtCost } from '../components.jsx';

/** Browsers hide the contents of a closed <details> from print, so open
 * everything first, print, then restore exactly what the reader had open. */
function printSession() {
  const folds = Array.from(document.querySelectorAll('details'));
  const was = folds.map((d) => d.open);
  folds.forEach((d) => (d.open = true));

  const restore = () => {
    folds.forEach((d, i) => (d.open = was[i]));
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);

  // let layout settle with the folds expanded before the print snapshot
  setTimeout(() => window.print(), 60);
}

function Ruling({ verdict }) {
  const v = verdict.body;
  return (
    <>
      <section className={`ruling ${v.conviction}`}>
        <div className="kicker">The ruling</div>
        <Stamp conviction={v.conviction} />
        <h2>{v.headline}</h2>
        <p className="crux-pull">
          <span className="label">It hinges on this</span>
          {v.crux}
        </p>
        {v.council_split && <p className="split">{v.council_split}</p>}
        <div className="cases">
          <div className="case-box">
            <h4>Strongest case for</h4>
            <p>{v.strongest_case_for}</p>
          </div>
          <div className="case-box">
            <h4>Strongest case against</h4>
            <p>{v.strongest_case_against}</p>
          </div>
        </div>
      </section>

      {v.falsifiable_tests?.length > 0 && (
        <section className="tests">
          <div className="kicker">Run these before writing code</div>
          {v.falsifiable_tests.map((t, i) => (
            <div className="test-row" key={i}>
              <div className="what">{t.test}</div>
              <div className="meta">{t.timebox} · {t.cost}</div>
              <div className="kill"><b>Kill it if:</b> {t.kills_idea_if}</div>
            </div>
          ))}
        </section>
      )}

      {(v.discarded_claims?.length > 0 || v.data_gaps?.length > 0) && (
        <section className="record-notes">
          {v.discarded_claims?.length > 0 && (
            <div className="note-block">
              <span className="label">Struck from the record</span>
              <ul className="struck-list">
                {v.discarded_claims.map((c, i) => {
                  const claim = typeof c === 'string' ? c : c.claim;
                  const note = typeof c === 'object' && c !== null ? c.note : null;
                  return (
                    <li key={i}>
                      <span className="flagged">{claim}</span>
                      {note && <span className="struck-note"> — {note}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {v.data_gaps?.length > 0 && (
            <div className="note-block">
              <span className="label">What couldn't be established</span>
              <ul className="gap-list">
                {v.data_gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default function Run() {
  const { slug } = useParams();
  const { data, error } = useRun(slug);
  const [pubBusy, setPubBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (error?.status === 404)
    return <div className="error-note">No session with this link. Check the URL?</div>;
  if (!data)
    return <div className="status-line"><span className="dot" />Opening the session…</div>;

  const { run, opinions, reviews, verdict } = data;
  const byRole = Object.fromEntries(opinions.map((o) => [o.role, o]));
  const complete = run.status === 'complete';
  const live = !complete && run.status !== 'failed';

  async function togglePublish() {
    setPubBusy(true);
    try {
      await publishRun(slug, !run.is_public);
      run.is_public = !run.is_public;
    } finally {
      setPubBusy(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <div className="print-head" aria-hidden="true">
        LYRA — Litigate Your Riskiest Assumptions · lyra session {slug}
      </div>

      <div className="session-head">
        <div className="case-no">Session {slug}</div>
        <h1>{run.idea_refined || run.idea_raw}</h1>
        {live && (
          <div className="status-line">
            <span className="dot" />
            {run.status_detail || 'In progress'}
          </div>
        )}
      </div>

      {live && <Pipeline status={run.status} />}

      {run.status === 'failed' && (
        <div className="error-note">{run.error || 'The session failed.'}</div>
      )}

      {complete && verdict && <Ruling verdict={verdict} />}

      <section className="panel">
        <div className="kicker">
          {complete ? (
            <>How each advisor ruled<span className="no-print"> — tap to read</span></>
          ) : (
            'The panel'
          )}
        </div>
        {ROLE_ORDER.map((role) => (
          <AdvisorRow key={role} role={role} opinion={byRole[role]} live={live} />
        ))}
      </section>

      {complete && reviews.length > 0 && (
        <details className="review-fold">
          <summary>How the panel ranked each other, blind</summary>
          <div className="review-body">
            <p className="review-note">
              Each advisor ranked the arguments without knowing who wrote what —
              including their own.
            </p>
            {reviews.map((r) => (
              <p key={r.reviewer_role}>
                <b>{ROLE_META[r.reviewer_role].title}:</b> {r.reasoning}
              </p>
            ))}
          </div>
        </details>
      )}

      {complete && (
        <div className="session-footer">
          <div>
            <button className="btn btn-quiet" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy link'}
            </button>{' '}
            <button className="btn btn-quiet" onClick={togglePublish} disabled={pubBusy}>
              {run.is_public ? 'Remove from the docket' : 'Publish to the docket'}
            </button>{' '}
            <button className="btn btn-quiet" onClick={printSession}>
              Export PDF
            </button>
          </div>
          <div className="cost">
            {fmtCost(run.cost_micro_usd) && <>this session cost {fmtCost(run.cost_micro_usd)} · </>}
            {run.tokens_in + run.tokens_out > 0 &&
              `${(run.tokens_in + run.tokens_out).toLocaleString()} tokens`}
          </div>
        </div>
      )}
    </>
  );
}