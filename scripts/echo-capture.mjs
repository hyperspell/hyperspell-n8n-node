// Request-capture harness. The node's existing tests only exercise postReceive
// functions in isolation — nothing asserts what request n8n's routing engine
// ACTUALLY builds. That is exactly the blind spot that let Document List send
// `limit` to an endpoint that reads `size` for months.
//
// Point a credential's Base URL at this server, run every operation through the
// real n8n, and read back the exact method / path / query / headers / body.
//
//   node scripts/echo-capture.mjs        # then set Base URL to http://localhost:5999
//   cat scripts/captured.jsonl           # one JSON line per request
//
// Env: CAPTURE_PORT (default 5999), CAPTURE_LOG (default scripts/captured.jsonl).
// Findings this surfaced: docs/incidents/2026-07-29-request-contract-audit.md
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';

const LOG = process.env.CAPTURE_LOG ?? new URL('./captured.jsonl', import.meta.url).pathname;
const PORT = Number(process.env.CAPTURE_PORT ?? 5999);
writeFileSync(LOG, '');

// Plausible responses so the routing engine's postReceive/pagination steps run
// the same way they do against the real API.
const pages = {};
function respond(url) {
  const p = url.pathname;
  if (p === '/users') {
    return { users: [{ user_id: 'echo-top-user', display_name: 'Echo', document_count: 9 }], total: 1, limit: 50, offset: 0 };
  }
  if (p === '/memories/query') {
    return {
      query_id: 'echo', answer: 'echo answer', errors: [],
      documents: [{
        resource_id: 'r1', source: 'vault', type: 'document', title: 'T', score: 0.5,
        summary: 'matched text', highlights: [{ text: 'matched text', score: 0.5 }],
        document: { type: 'document', id: 'd1', children: [{ type: 'paragraph', text: 'x'.repeat(500) }] },
      }],
    };
  }
  if (p === '/memories/list') {
    // Hand out exactly one next_cursor per server run so the pagination loop
    // actually runs a SECOND request — page two is where the shallow-merge bug
    // dropped the filters.
    pages.list = (pages.list ?? 0) + 1;
    return {
      __page: pages.list,
      items: [{
        resource_id: 'r1', source: 'vault', type: 'document', title: 'T', status: 'completed',
        document: { type: 'document', id: 'd1', children: [{ type: 'paragraph', text: 'y'.repeat(500) }] },
      }],
      next_cursor: pages.list === 1 ? 'CURSOR-PAGE-2' : null,
    };
  }
  if (p.startsWith('/memories/get/')) {
    return { resource_id: 'r1', source: 'vault', type: 'document', title: 'T', document: { type: 'document', id: 'd1', children: [] } };
  }
  if (p === '/memories/add') return { resource_id: 'r1', status: 'pending' };
  if (p.startsWith('/memories/delete/')) return { success: true };
  if (p === '/live/sources') return { sources: [{ source: 'notion', capabilities: ['list'] }] };
  if (p.endsWith('/search')) return { documents: [], indexed: false, notes: ['echo'] };
  if (p.endsWith('/resources')) {
    pages.live = (pages.live ?? 0) + 1;
    return { items: [{ resource_id: 'lr1', source: 'notion', type: 'document', title: 'L', document: { type: 'document', id: 'l1', children: [] } }],
             next_cursor: pages.live === 1 ? 'LIVE-CURSOR-2' : null };
  }
  return { ok: true };
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString();
    let body = rawBody;
    try { body = JSON.parse(rawBody); } catch {}
    const { authorization, ...headers } = req.headers;
    appendFileSync(LOG, JSON.stringify({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      asUser: req.headers['x-as-user'] ?? null,
      contentType: req.headers['content-type'] ?? null,
      body: body === '' ? null : body,
      authScheme: (authorization ?? '').split(' ')[0] || null,
    }) + '\n');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respond(url)));
  });
}).listen(PORT, () => console.log(`request-capture server on :${PORT}, logging to ${LOG}`));
