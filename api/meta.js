// Universal Meta Graph API proxy.
// GET  /api/meta?path=act_123/insights&level=campaign&... -> proxies a read (auto-follows paging)
// POST /api/meta?path=120xxxxx           body: { daily_budget: 5000000, status: 'PAUSED' } -> proxies a write
//
// Token resolution order: ?token= / x-meta-token header / body.token / env META_ACCESS_TOKEN
// Set GRAPH_VERSION env to change API version (default v21.0).

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.GRAPH_VERSION || 'v21.0';
const MAX_PAGES = 25; // safety cap when auto-following paging

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-meta-token');
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query || {};
  const path = (q.path || '').replace(/^\/+/, '');
  if (!path) return res.status(400).json({ error: { message: 'Missing ?path' } });

  const body = req.method === 'POST' ? await readBody(req) : {};
  const token =
    q.token ||
    req.headers['x-meta-token'] ||
    body.token ||
    process.env.META_ACCESS_TOKEN ||
    '';
  if (!token) return res.status(400).json({ error: { message: 'Missing access token' } });

  try {
    if (req.method === 'POST') {
      // Write: forward body fields (minus token) as form params.
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (k === 'token') continue;
        form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
      form.append('access_token', token);
      const r = await fetch(`${GRAPH}/${VERSION}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const json = await r.json();
      return res.status(r.status).json(json);
    }

    // Read: build query from passthrough params, auto-follow paging into data[].
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (k === 'path' || k === 'token' || k === 'nopage') continue;
      params.append(k, v);
    }
    params.append('access_token', token);

    let url = `${GRAPH}/${VERSION}/${path}?${params.toString()}`;
    const collected = [];
    let last = null;
    let pages = 0;
    const follow = q.nopage !== '1';

    while (url && pages < MAX_PAGES) {
      const r = await fetch(url);
      const json = await r.json();
      if (!r.ok || json.error) return res.status(r.ok ? 400 : r.status).json(json);
      last = json;
      if (Array.isArray(json.data)) {
        collected.push(...json.data);
        url = follow && json.paging && json.paging.next ? json.paging.next : null;
      } else {
        url = null; // single object response
      }
      pages++;
    }

    if (last && Array.isArray(last.data)) {
      return res.status(200).json({ data: collected, pages });
    }
    return res.status(200).json(last || { data: [] });
  } catch (e) {
    return res.status(502).json({ error: { message: 'Proxy error: ' + (e.message || e) } });
  }
}
