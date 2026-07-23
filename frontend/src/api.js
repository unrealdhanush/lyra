import { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// VITE_ vars are baked in at BUILD time, not read at runtime. If this warns
// on a deployed site, set VITE_API_URL in Vercel and REDEPLOY — saving the
// variable alone won't change an already-built bundle.
if (!import.meta.env.VITE_API_URL && window.location.hostname !== 'localhost') {
  console.error(
    'VITE_API_URL is not set. This build is pointing at localhost:8000 and ' +
      'every request will fail. Set it in Vercel, then redeploy.'
  );
}

export const ADMIN_KEY = 'lyra_admin';

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const admin = localStorage.getItem(ADMIN_KEY);
  if (admin) headers['X-Admin-Token'] = admin;

  const res = await fetch(`${API}${path}`, { headers, ...opts });
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

export const getGallery = (all = false) =>
  req(`/api/gallery${all ? '?scope=all' : ''}`);

export const deleteRun = (slug) =>
  req(`/api/admin/runs/${slug}`, { method: 'DELETE' });

export const getPanel = () => req('/api/panel');

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