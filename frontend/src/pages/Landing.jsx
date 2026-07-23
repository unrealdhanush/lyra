import { Link } from 'react-router-dom';
import { Reveal } from '../components.jsx';

const MEMBERS = [
  {
    name: 'The Operator',
    q: 'Can this actually be built and kept running?',
    body: "Has shipped and maintained software, and has an allergy to scope that sounds easy in a pitch and is brutal in production. Judges the hardest engineering problem, what has to be real on day one, and the ongoing cost nobody budgets for.",
    ignores: 'Ignores market size and timing — not its lane.',
  },
  {
    name: 'The Gravedigger',
    q: 'Who tried this before, and what killed them?',
    body: 'Remembers the bodies. Finds the graveyard of structurally similar attempts, names the cause of death, and asks whether that cause is still in the room. A graveyard with no bodies is a genuine finding — an empty market can mean opportunity or a market that keeps failing to form.',
    ignores: 'Ignores product elegance and founder enthusiasm.',
  },
  {
    name: 'The Distributor',
    q: 'Where do the users come from, and who pays?',
    body: 'Believes distribution kills more products than bad code does. Wants a named first hundred users and a specific reason they come back — hostile to any plan that reduces to "we get a small slice of a large market."',
    ignores: 'Ignores technical feasibility and long-term vision.',
  },
  {
    name: 'Why Now',
    q: 'What changed to make this possible today?',
    body: 'Builds the strongest honest case for the idea — out of falsifiable claims, not optimism. Identifies what would have to be true, then checks whether it is true now and what recently made it so. "Nothing changed; this was buildable in 2015" is a valid and valuable verdict.',
    ignores: 'Never cheerleads. Enthusiasm without a mechanism is noise.',
  },
];

const STEPS = [
  { n: '01', t: 'State your idea', d: 'Who it\'s for, the problem, roughly how. Too thin to judge? The panel asks two sharp questions before spending your session.' },
  { n: '02', t: 'The panel deliberates', d: 'Four advisors assess it in parallel, each from their own mandate. You watch them land one by one.' },
  { n: '03', t: 'They rank each other, blind', d: 'Every advisor rates the others\' arguments without knowing who wrote what. Any invented number gets flagged and struck.' },
  { n: '04', t: 'The chair rules', d: 'A verdict that commits - build, test first, reshape, or walk away with falsifiable tests you can run in a week.' },
];

export default function Landing() {
  return (
    <>
      <section className="lp-hero">
        <div className="orb orb-a" aria-hidden="true" />
        <div className="orb orb-b" aria-hidden="true" />
        <div className="acronym-line">
          <b>L</b>itigate <b>Y</b>our <b>R</b>iskiest <b>A</b>ssumptions
        </div>
        <h1>Put your idea on trial.</h1>
        <p className="lp-lede">
          Four AI advisors with conflicting mandates argue your startup idea out,
          rank each other blind, and a chairman rules. Grounded in what can be
          sourced, with unverifiable numbers struck from the record.
        </p>
        <Link to="/new" className="btn btn-lg">Begin a session &rarr;</Link>
        <div className="lp-free">One free session, no account. About 90 seconds.</div>
      </section>

      <section className="lp-section">
        <Reveal>
          <div className="kicker">The panel</div>
          <h2 className="lp-h2">Four advisors who disagree on purpose.</h2>
          <p className="lp-sub">
            Each one optimizes for a single thing and is forbidden from caring about
            the rest. That tension is the design - it's what stops four models
            agreeing with you in four different ways.
          </p>
        </Reveal>
        <div className="member-grid">
          {MEMBERS.map((m, i) => (
            <Reveal key={m.name} delay={i * 90}>
              <article className="member">
                <h3>{m.name}</h3>
                <p className="member-q">{m.q}</p>
                <p className="member-body">{m.body}</p>
                <p className="member-ignores">{m.ignores}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <Reveal>
          <div className="kicker">How a session works</div>
        </Reveal>
        <div className="steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 80}>
              <div className="step">
                <span className="step-n">{s.n}</span>
                <div>
                  <div className="step-t">{s.t}</div>
                  <div className="step-d">{s.d}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="lp-section lp-promise">
        <Reveal>
        <div className="kicker">The rule that makes it trustworthy</div>
        <h2 className="lp-h2">It won't make up numbers to sound sure.</h2>
        <p className="lp-sub">
          Facts and judgment run on separate tracks. Any figure an advisor cites
          is checked against sourced data during peer review; anything unverifiable
          is flagged by the panel and struck from the ruling. An empty market shows
          as empty, not padded with an invented total.
        </p>
        <Link to="/new" className="btn btn-lg">Put an idea on trial &rarr;</Link>
        </Reveal>
      </section>
    </>
  );
}
