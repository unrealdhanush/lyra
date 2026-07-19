export const ROLE_META = {
  operator: {
    title: 'The Operator',
    charge: 'Can this actually be built and kept running?',
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
  const label = { build: 'Build', test_first: 'Test first', reshape: 'Reshape', walk_away: 'Walk away' }[
    conviction
  ];
  return <span className={`stamp ${conviction}${mini ? ' mini' : ''}`}>{label}</span>;
}

export function AdvisorSeat({ role, opinion }) {
  const meta = ROLE_META[role];

  if (!opinion) {
    return (
      <div className="seat empty">
        <span className="role">{meta.title}</span>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, marginTop: 8 }}>
          deliberating…
        </div>
        <div style={{ fontSize: 13.5, marginTop: 4 }}>{meta.charge}</div>
      </div>
    );
  }

  if (opinion.failed) {
    return (
      <div className="seat empty">
        <span className="role">{meta.title}</span>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 13, marginTop: 8 }}>
          did not respond — the panel proceeded without this seat
        </div>
      </div>
    );
  }

  const b = opinion.body || {};
  return (
    <div className="seat">
      <div>
        <span className="role">{meta.title}</span>
        <span className="model">{opinion.model}</span>
      </div>
      <div>
        <span className={`chip ${opinion.verdict}`}>
          {VERDICT_LABEL[opinion.verdict]} · {opinion.confidence} confidence
        </span>
      </div>
      <div className="headline">{opinion.headline}</div>
      <div className="argument">{b.argument}</div>
      {b.strongest_counter_to_my_own_view && (
        <div className="concede">Concedes: {b.strongest_counter_to_my_own_view}</div>
      )}
      {b.unknowns_that_would_change_my_mind?.length > 0 && (
        <details>
          <summary>What would change this advisor's mind</summary>
          <ul className="unknowns">
            {b.unknowns_that_would_change_my_mind.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function fmtCost(microUsd) {
  if (!microUsd) return null;
  return `$${(microUsd / 1_000_000).toFixed(2)}`;
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
