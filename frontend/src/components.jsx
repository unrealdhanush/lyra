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
  return <span className={`stamp ${conviction}${mini ? ' mini' : ''}`}>{label}</span>;
}

export function ScoreBar({ score, dimension }) {
  return (
    <span className="score" title={`${dimension}: ${score}/10`}>
      <span className="score-track">
        <span className="score-fill" style={{ width: `${score * 10}%` }} />
      </span>
      <span className="score-num">
        {score}<span className="score-den">/10 {dimension}</span>
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

export function fmtCost(microUsd) {
  if (!microUsd) return null;
  return `$${(microUsd / 1_000_000).toFixed(2)}`;
}
