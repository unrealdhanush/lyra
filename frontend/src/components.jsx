import { useEffect, useRef, useState } from 'react';

/** Scroll-triggered reveal. Children rise in when they enter the viewport;
 * renders instantly for prefers-reduced-motion. */
export function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} rv${shown ? ' rv-in' : ''}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

const STAGES = [
  { key: 'researching', label: 'Research', sub: 'building the dossier' },
  { key: 'deliberating', label: 'Deliberation', sub: 'four advisors, in parallel' },
  { key: 'reviewing', label: 'Review', sub: 'ranking each other, blind' },
  { key: 'synthesizing', label: 'Verdict', sub: 'the chair synthesizes' },
];

/** The query loop as a connected pipeline: filled nodes behind, a glowing
 * pulse on the current stage, a traveling shimmer on the segment in flight. */
export function Pipeline({ status }) {
  const order = STAGES.map((s) => s.key);
  const cur = order.indexOf(status);
  const done = status === 'complete';

  return (
    <div className="pipe" role="progressbar" aria-valuenow={done ? 4 : cur + 1} aria-valuemin={0} aria-valuemax={4}>
      {STAGES.map((s, i) => {
        const state = done || (cur !== -1 && i < cur) ? 'done' : i === cur ? 'active' : 'todo';
        const segState = done || (cur !== -1 && i < cur) ? 'done' : i === cur ? 'active' : 'todo';
        return (
          <div className={`pipe-stage ${state}`} key={s.key}>
            {i > 0 && <span className={`pipe-seg ${segState}`} aria-hidden="true" />}
            <span className="pipe-node" aria-hidden="true">
              {state === 'done' ? (
                <svg viewBox="0 0 12 12" className="pipe-check"><path d="M2.5 6.2 L5 8.7 L9.5 3.6" /></svg>
              ) : (
                <span className="pipe-num">{i + 1}</span>
              )}
            </span>
            <span className="pipe-label">{s.label}</span>
            <span className="pipe-sub">{s.sub}</span>
          </div>
        );
      })}
    </div>
  );
}

export const ROLE_META = {
  operator: {
    title: 'The Operator',
    charge: 'Can this be built and kept running?',
  },
  gravedigger: {
    title: 'The Gravedigger',
    charge: 'Who tried this before, and what killed them?',
  },
  distributor: {
    title: 'The Distributor',
    charge: 'Where do users come from, and who pays?',
  },
  why_now: {
    title: 'Why Now',
    charge: 'What changed to make this possible today?',
  },
};

export const ROLE_ORDER = ['operator', 'gravedigger', 'distributor', 'why_now'];

const VERDICT_LABEL = {
  strong_yes: 'strong yes',
  yes: 'yes',
  mixed: 'mixed',
  no: 'no',
  strong_no: 'strong no',
};

export function Stamp({ conviction, mini }) {
  const label = {
    build: 'Build',
    test_first: 'Test first',
    reshape: 'Reshape',
    walk_away: 'Walk away',
  }[conviction];

  if (mini) return <span className={`stamp ${conviction} mini`}>{label}</span>;

  // keyed on conviction so the slam replays if the verdict ever re-renders
  return (
    <span className="stamp-wrap" key={conviction}>
      <span className={`stamp ${conviction}`}>{label}</span>
      <span className={`stamp-ring ${conviction}`} aria-hidden="true" />
    </span>
  );
}

export function ScoreBar({ score, dimension }) {
  return (
    <span className="score" title={`${dimension}: ${score}/10`}>
      <span className="score-track">
        <span className="score-fill" style={{ width: `${score * 10}%` }} />
      </span>
      <span className="score-num">
        {score}<span className="score-den">/10 {String(dimension).toLowerCase()}</span>
      </span>
    </span>
  );
}

/**
 * One advisor. Live: an open card that fills in when the opinion lands.
 * Complete: a collapsed row — verdict, score, headline — expandable to the
 * full argument. The ruling above it is the summary; these are the evidence.
 */
export function AdvisorRow({ role, opinion, live }) {
  const meta = ROLE_META[role];

  if (!opinion) {
    return (
      <div className="adv adv-waiting">
        <div className="adv-line">
          <span className="adv-role">{meta.title}</span>
          <span className="adv-pending"><span className="dot" />deliberating</span>
        </div>
        <div className="adv-charge">{meta.charge}</div>
      </div>
    );
  }

  if (opinion.failed) {
    return (
      <div className="adv adv-waiting">
        <div className="adv-line">
          <span className="adv-role">{meta.title}</span>
          <span className="adv-pending">did not respond — the panel proceeded without this seat</span>
        </div>
      </div>
    );
  }

  const b = opinion.body || {};
  const score = b.dimension_score;

  return (
    <details className="adv" open={live}>
      <summary>
        <span className="adv-line">
          <span className="adv-role">{meta.title}</span>
          <span className={`chip ${opinion.verdict}`}>{VERDICT_LABEL[opinion.verdict]}</span>
          <span className="adv-model" title={`Answered by ${opinion.model}`}>
            {shortModel(opinion.model)}
          </span>
          {score && <ScoreBar score={score.score} dimension={score.dimension} />}
        </span>
        <span className="adv-headline">{opinion.headline}</span>
      </summary>
      <div className="adv-body">
        <div className="adv-meta">
          {opinion.model} · {opinion.confidence} confidence
        </div>
        <div className="adv-argument">{b.argument}</div>
        {b.strongest_counter_to_my_own_view && (
          <p className="adv-concede">Concedes: {b.strongest_counter_to_my_own_view}</p>
        )}
        {b.unknowns_that_would_change_my_mind?.length > 0 && (
          <div className="adv-unknowns">
            <span className="label">Would change this advisor's mind</span>
            <ul>
              {b.unknowns_that_would_change_my_mind.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

/** 'anthropic/claude-haiku-4.5' -> 'claude-haiku-4.5' */
export function shortModel(id) {
  return String(id || '').split('/').pop();
}

export function fmtCost(microUsd) {
  if (!microUsd) return null;
  return `$${(microUsd / 1_000_000).toFixed(2)}`;
}