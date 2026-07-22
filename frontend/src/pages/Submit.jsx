import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitIdea } from '../api';

export default function Submit() {
  const nav = useNavigate();
  const [idea, setIdea] = useState('');
  const [byok, setByok] = useState('');
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const payload = { idea, byok_key: byok || null };
      if (questions) {
        payload.clarifications = questions.map((q, i) => ({
          question: q,
          answer: answers[i] || '',
        }));
      }
      const res = await submitIdea(payload);
      if (res.status === 'needs_clarification') {
        setQuestions(res.questions);
        setAnswers({});
      } else {
        nav(`/r/${res.share_slug}`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    idea.trim().length >= 10 &&
    (!questions || questions.every((_, i) => (answers[i] || '').trim().length > 0));

  return (
    <>
      <div className="hero">
        <div className="acronym-line">
          <b>L</b>itigate <b>Y</b>our <b>R</b>iskiest <b>A</b>ssumptions
        </div>
        <h1>Put your idea on trial.</h1>
        <p>
          Four models with conflicting mandates argue it out, rank each other
          blind, and a chairman rules — grounded in sourced market data, with
          unverifiable numbers struck from the record. One free session per
          visitor.
        </p>
      </div>

      <div className="panel-strip">
        <div className="panel-mini">
          <div className="name">The Operator</div>
          <div className="q">Can this be built and kept running?</div>
        </div>
        <div className="panel-mini">
          <div className="name">The Gravedigger</div>
          <div className="q">Who tried this before, and what killed them?</div>
        </div>
        <div className="panel-mini">
          <div className="name">The Distributor</div>
          <div className="q">Where do users come from, and who pays?</div>
        </div>
        <div className="panel-mini">
          <div className="name">Why Now</div>
          <div className="q">What changed to make this possible today?</div>
        </div>
      </div>

      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="What's the idea? Who is it for, what problem does it solve, and roughly how? Two or three sentences is plenty — if the panel needs more, it will ask."
        disabled={!!questions}
      />

      {questions && (
        <div className="clarify">
          <h2>Pre-trial questions</h2>
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 15 }}>
            You get one session — these answers make it count.
          </p>
          {questions.map((q, i) => (
            <div key={i}>
              <label>{q}</label>
              <input
                type="text"
                value={answers[i] || ''}
                onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      {error && <div className="error-note">{error}</div>}

      <button className="btn" onClick={go} disabled={!canSubmit || busy}>
        {busy ? 'Opening the session…' : 'Begin the trial'}
      </button>
      <div className="field-note">
        A session takes about 90 seconds and runs in the open — you'll watch
        each advisor land.
      </div>

      <details className="byok">
        <summary>Already used your free session? Bring your own OpenRouter key</summary>
        <div style={{ marginTop: 12 }}>
          <input
            type="password"
            placeholder="sk-or-…"
            value={byok}
            onChange={(e) => setByok(e.target.value)}
          />
          <div className="field-note">
            Your key is sent to our server for this run's model calls only and
            is never stored. A session costs cents. Tip: create a key with a
            small credit limit just for this.
          </div>
        </div>
      </details>
    </>
  );
}
