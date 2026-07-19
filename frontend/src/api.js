import { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.detail || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

export const submitIdea = (payload) =>
  req('/api/ideas', { method: 'POST', body: JSON.stringify(payload) });

export const getRun = (slug) => req(`/api/runs/${slug}`);

export const publishRun = (slug, isPublic) =>
  req(`/api/runs/${slug}/publish`, {
    method: 'POST',
    body: JSON.stringify({ public: isPublic }),
  });

export const getGallery = () => req('/api/gallery');

const DONE = new Set(['complete', 'failed']);

/** Polls the run every 2.5s until it completes or fails. At 60-90s run
 * length the trickle of advisors landing still feels live. */
export function useRun(slug) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const d = await getRun(slug);
        if (!alive) return;
        setData(d);
        setError(null);
        if (!DONE.has(d.run.status)) {
          timer.current = setTimeout(tick, 2500);
        }
      } catch (e) {
        if (!alive) return;
        setError(e);
        // transient network blips shouldn't kill a live session view
        if (e.status !== 404) timer.current = setTimeout(tick, 4000);
      }
    }

    tick();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [slug]);

  return { data, error };
}
