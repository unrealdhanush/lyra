import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRun, publishRun } from '../api';
import { AdvisorRow, ROLE_META, ROLE_ORDER, Stamp, fmtCost } from '../components.jsx';

const STAGES = [
  { key: 'researching', label: 'Research' },
  { key: 'deliberating', label: 'Deliberation' },
  { key: 'reviewing', label: 'Review' },
  { key: 'synthesizing', label: 'Verdict' },
];

function stageClass(stageKey, status) {
  const order = STAGES.map((s) => s.key);
  const cur = order.indexOf(status);
  const idx = order.indexOf(stageKey);
  if (idx === cur) return 'stage active';
  if (cur === -1 || idx < cur) return 'stage done';
  return 'stage';
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
            <p>
              <span className="label">Struck from the record</span>
              {v.discarded_claims.map((c, i) => (
                <span key={i} className="flagged">{c}</span>
              ))}
            </p>
          )}
          {v.data_gaps?.length > 0 && (
            <p>
              <span className="label">What couldn't be established</span>
              {v.data_gaps.join(' · ')}
            </p>
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

      {live && (
        <div className="stage-rail">
          {STAGES.map((s) => (
            <div key={s.key} className={stageClass(s.key, run.status)}>{s.label}</div>
          ))}
        </div>
      )}

      {run.status === 'failed' && (
        <div className="error-note">{run.error || 'The session failed.'}</div>
      )}

      {complete && verdict && <Ruling verdict={verdict} />}

      <section className="panel">
        <div className="kicker">
          {complete ? 'How each advisor ruled — tap to read' : 'The panel'}
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
