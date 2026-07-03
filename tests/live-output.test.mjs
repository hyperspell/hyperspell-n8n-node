// Tests for the Live-resource envelope unwrapping (nodes/Hyperspell/resources/live/output.ts).
// Runs against the BUILT output (dist/) with Node's built-in test runner — zero extra deps,
// publish pipeline untouched: `npm test` (builds first) or `node --test tests/` after a build.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { unwrapLiveEnvelope, unwrapCursorPage } = require(
	'../dist/nodes/Hyperspell/resources/live/output.js',
);

// Real-shape fixture: verbatim prod response bytes from the 2026-07-03 live
// reproduction (GET /live/hubspot/resources?size=2, app 994) recorded in
// docs/incidents/2026-06-11-live-resource-hyperdoc-shape.md — NOT hand-rolled
// JSON, so backend schema drift can't hide in an idealized fixture.
const PROD_CURSOR_PAGE = {
	items: [
		{
			resource_id: 'contact:479239644873',
			source: 'hubspot',
			type: 'person',
			title: 'Maria Johnson',
			status: 'pending',
			metadata: {},
			last_modified_at: '2026-04-30T03:42:51Z',
			document_date: '2026-04-29T20:25:46Z',
			document: {
				type: 'person',
				id: '73b33537684c',
				children: [],
				name: 'Maria Johnson',
				email: 'emailmaria@hubspot.com',
				company: 'HubSpot',
			},
		},
	],
	next_cursor: 'opaque-cursor-token',
};

const call = (fn, body) => fn.call(undefined, [], { body, headers: {}, statusCode: 200 });

// ── unwrapLiveEnvelope (Search / Get Resource) ─────────────────────────────

test('search/get: one item per document, envelope indexed/notes merged onto each', async () => {
	const out = await call(unwrapLiveEnvelope, {
		documents: [
			{ resource_id: 'a', title: 'A', document: { type: 'document', children: [] } },
			{ resource_id: 'b', title: 'B', document: { type: 'document', children: [] } },
		],
		indexed: true,
		notes: ['queued 2 documents'],
	});
	assert.equal(out.length, 2);
	assert.equal(out[0].json.resource_id, 'a');
	assert.equal(out[1].json.resource_id, 'b');
	for (const item of out) {
		assert.equal(item.json.indexed, true);
		assert.deepEqual(item.json.notes, ['queued 2 documents']);
		assert.ok(item.json.document, 'hyperdoc tree must survive the unwrap');
	}
});

test('search/get: zero documents WITH notes emits one envelope item (never silently empty)', async () => {
	// The live_access.py empty-fetch path: {documents: [], indexed: false,
	// notes: ["indexing skipped: fetch returned no resources"]}. A bare
	// rootProperty would emit zero items and drop the explanation.
	const out = await call(unwrapLiveEnvelope, {
		documents: [],
		indexed: false,
		notes: ['indexing skipped: fetch returned no resources'],
	});
	assert.equal(out.length, 1);
	assert.deepEqual(out[0].json.documents, []);
	assert.equal(out[0].json.indexed, false);
	assert.deepEqual(out[0].json.notes, ['indexing skipped: fetch returned no resources']);
});

test('search/get: zero documents without notes emits zero items (IF-node emptiness works)', async () => {
	const out = await call(unwrapLiveEnvelope, { documents: [], indexed: false, notes: [] });
	assert.deepEqual(out, []);
});

test('search/get: missing documents key emits zero items, never {json: undefined}', async () => {
	// n8n's own rootProperty wraps a missing key into one {json: undefined}
	// item (lodash.get → undefined → [undefined]); our unwrap must not.
	for (const body of [{}, null, undefined, { unrelated: true }]) {
		const out = await call(unwrapLiveEnvelope, body);
		assert.deepEqual(out, [], `body=${JSON.stringify(body)}`);
	}
});

test('search/get: defaults applied when envelope fields are absent (exclude_none variance)', async () => {
	const out = await call(unwrapLiveEnvelope, { documents: [{ resource_id: 'x' }] });
	assert.equal(out.length, 1);
	assert.equal(out[0].json.indexed, false);
	assert.deepEqual(out[0].json.notes, []);
});

// ── unwrapCursorPage (List Resources) ──────────────────────────────────────

test('list: real prod fixture — one item per resource, next_cursor on each, document tree intact', async () => {
	const out = await call(unwrapCursorPage, PROD_CURSOR_PAGE);
	assert.equal(out.length, 1);
	const item = out[0].json;
	assert.equal(item.resource_id, 'contact:479239644873');
	assert.equal(item.next_cursor, 'opaque-cursor-token');
	assert.equal(item.document.name, 'Maria Johnson');
});

test('list: last page (no next_cursor, exclude_none drops it) → next_cursor null on items', async () => {
	// The google_mail prod response omitted next_cursor entirely.
	const out = await call(unwrapCursorPage, {
		items: [{ resource_id: 'only', source: 'google_mail', document: { type: 'conversation' } }],
	});
	assert.equal(out.length, 1);
	assert.equal(out[0].json.next_cursor, null);
});

test('list: empty or missing items emits zero items, never {json: undefined}', async () => {
	for (const body of [{ items: [] }, {}, null, undefined, { items: null }]) {
		const out = await call(unwrapCursorPage, body);
		assert.deepEqual(out, [], `body=${JSON.stringify(body)}`);
	}
});
