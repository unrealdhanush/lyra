import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRun, publishRun } from '../api';
import {
  AdvisorSeat,
  ROLE_META,
  ROLE_ORDER,
  Stamp,
  fmtCost,
  fmtTime,
} from '../components.jsx';

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
  if (status === 'complete') return 'stage done';
  if (idx === cur) return 'stage active';
  if (cur === -1 || idx < cur) return 'stage done';
  return 'stage';
}

function transcript(data) {
  const { run, opinions, reviews, verdict } = data;
  const entries = [{ t: run.created_at, text: 'Session opened. The record begins.' }];
  for (const o of opinions) {
    entries.push({
      t: o.created_at,
      text: o.failed
        ? `${ROLE_META[o.role].title} did not respond.`
        : `${ROLE_META[o.role].title} entered a verdict: ${o.headline}`,
    });
  }
  for (const r of reviews) {
    entries.push({
      t: r.created_at,
      text: `${ROLE_META[r.reviewer_role].title} filed a blind review of the panel.`,
    });
  }
  if (verdict) {
    entries.push({ t: verdict.created_at, text: 'The chair entered a ruling.' });
  }
  if (run.status === 'complete') {
    entries.push({ t: run.completed_at, text: 'Session closed.' });
  }
  return entries.sort((a, b) => new Date(a.t) - new Date(b.t));
}

export default function Run() {
  const { slug } = useParams();
  const { data, error } = useRun(slug);
  const [pubBusy, setPubBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (error?.status === 404)
    return <div className="error-note">No such session. Check the link?</div>;
  if (!data)
    return <div className="status-line"><span className="dot" />Opening the record…</div>;

  const { run, opinions, reviews, verdict } = data;
  const byRole = Object.fromEntries(opinions.map((o) => [o.role, o]));
  const flags = reviews.flatMap((r) => r.unsupported_claims || []);
  const v = verdict?.body;

  async function togglePublish() {
    setPubBusy(true);
    try {
      await publishRun(slug, !run.is_public);
      run.is_public = !run.is_public; // next poll confirms
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
        {run.status !== 'complete' && run.status !== 'failed' && (
          <div className="status-line">
            <span className="dot" />
            {run.status_detail || 'In progress'}
          </div>
        )}
      </div>

      <div className="stage-rail">
        {STAGES.map((s) => (
          <div key={s.key} className={stageClass(s.key, run.status)}>
            {s.label}
          </div>
        ))}
      </div>

      {run.status === 'failed' && (
        <div className="error-note">{run.error || 'The session failed.'}</div>
      )}

      <div className="seats">
        {ROLE_ORDER.map((role) => (
          <AdvisorSeat key={role} role={role} opinion={byRole[role]} />
        ))}
      </div>

      {reviews.length > 0 && (
        <div className="review-strip">
          <h3>Blind peer review</h3>
          <p style={{ fontSize: 14.5, color: 'var(--ink-2)', margin: '0 0 8px' }}>
            Each advisor ranked the panel's arguments without knowing who wrote
            what — including their own.
          </p>
          {reviews.map((r) => (
            <p key={r.reviewer_role} style={{ fontSize: 14.5, margin: '6px 0' }}>
              <b>{ROLE_META[r.reviewer_role].title}:</b> {r.reasoning}{' '}
              {r.crux && <span style={{ color: 'var(--ink-2)' }}>Crux: {r.crux}</span>}
            </p>
          ))}
          {flags.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 14 }}>Claims flagged as unsupported:</b>
              {flags.map((f, i) => (
                <p key={i} style={{ margin: '4px 0', fontSize: 14 }}>
                  <span className="flagged">{f.claim}</span>{' '}
                  <span className="flag-why">— {f.why}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {v && (
        <div className="verdict">
          <div className="kicker">THE RULING</div>
          <h2>{v.headline}</h2>
          <Stamp conviction={v.conviction} />

          <p style={{ marginTop: 18, fontSize: 15 }}>
            <b>The split:</b> {v.council_split}
          </p>
          <p style={{ fontSize: 15 }}>
            <b>The crux:</b> {v.crux}
          </p>

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

          {v.falsifiable_tests?.length > 0 && (
            <div className="tests">
              <div className="kicker">RUN THESE BEFORE WRITING CODE</div>
              {v.falsifiable_tests.map((t, i) => (
                <div className="test-row" key={i}>
                  <div className="what">{t.test}</div>
                  <div className="meta">
                    {t.timebox} · {t.cost}
                  </div>
                  <div className="kill">
                    <b>KILL IF:</b> {t.kills_idea_if}
                  </div>
                </div>
              ))}
            </div>
          )}

          {v.discarded_claims?.length > 0 && (
            <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              <b>Struck from the record:</b>{' '}
              {v.discarded_claims.map((c, i) => (
                <span key={i} className="flagged" style={{ marginRight: 8 }}>
                  {c}
                </span>
              ))}
            </p>
          )}

          {v.data_gaps?.length > 0 && (
            <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              <b>What the record couldn't establish:</b> {v.data_gaps.join(' · ')}
            </p>
          )}
        </div>
      )}

      <div className="transcript">
        {transcript(data).map((e, i) => (
          <div className="entry" key={i}>
            <span className="t">{fmtTime(e.t)}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>

      {run.status === 'complete' && (
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
            {fmtCost(run.cost_micro_usd) && (
              <>this session cost {fmtCost(run.cost_micro_usd)} · </>
            )}
            {run.tokens_in + run.tokens_out > 0 &&
              `${(run.tokens_in + run.tokens_out).toLocaleString()} tokens`}
          </div>
        </div>
      )}
    </>
  );
}
