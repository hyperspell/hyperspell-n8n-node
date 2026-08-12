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

/**
 * Minimal IExecuteSingleFunctions stand-in. The unwrappers now read the
 * Simplify parameter (every /live/* route returns a plain DocumentResponse
 * whose hyperdoc tree is otherwise unbounded), so `this` must be a real
 * context — n8n always binds one; only this harness ever passed undefined.
 */
const ctx = (options = {}) => ({
	getNodeParameter: (name, fallback) =>
		name === 'simplify' ? (options.simplify ?? fallback) : fallback,
});

const call = (fn, body, options = {}) =>
	fn.call(ctx(options), [], { body, headers: {}, statusCode: 200 });

// ── unwrapLiveEnvelope (Search / Get Resource) ─────────────────────────────

test('search/get: one item per document, envelope indexed/notes merged onto each', async () => {
	// Simplify off: this test is about the ENVELOPE contract (siblings must not
	// be dropped), so it asserts the raw shape. Bounding is covered separately.
	const out = await call(
		unwrapLiveEnvelope,
		{
			documents: [
				{ resource_id: 'a', title: 'A', document: { type: 'document', children: [] } },
				{ resource_id: 'b', title: 'B', document: { type: 'document', children: [] } },
			],
			indexed: true,
			notes: ['queued 2 documents'],
		},
		{ simplify: false },
	);
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
	// Simplify off — asserts the unwrap itself preserves the raw document.
	const out = await call(unwrapCursorPage, PROD_CURSOR_PAGE, { simplify: false });
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

// ── Bounding (ENG-3697: "the node pumps too many tokens") ──────────────────
//
// Every /live/* route returns the plain DocumentResponse — no summary, no
// highlights, body only in the `document` tree — and nothing bounded it before
// 0.7.2. The Live resource is the surface built for an AI-agent node, so it was
// simultaneously the most likely to feed a model and the only one shipping an
// unbounded payload.

test('live search/get: Simplify (default on) replaces the tree with flattened text', async () => {
	const body = 'x'.repeat(5000);
	const out = await call(unwrapLiveEnvelope, {
		documents: [
			{
				resource_id: 'a',
				title: 'A',
				document: { type: 'document', children: [{ type: 'paragraph', text: body }] },
			},
		],
		indexed: true,
		notes: [],
	});
	const item = out[0].json;
	assert.equal(item.document, undefined, 'hyperdoc tree must be dropped when simplified');
	assert.equal(typeof item.text, 'string');
	assert.equal(item.text.length, 2000, 'text is capped at MAX_SIMPLIFIED_TEXT');
	// Envelope siblings still ride along — bounding must not undo the unwrap contract.
	assert.equal(item.indexed, true);
	assert.equal(item.resource_id, 'a');
});

test('live list: Simplify (default on) bounds each row and keeps next_cursor', async () => {
	const out = await call(unwrapCursorPage, PROD_CURSOR_PAGE);
	const item = out[0].json;
	assert.equal(item.document, undefined);
	assert.equal(item.next_cursor, 'opaque-cursor-token');
	assert.equal(item.resource_id, 'contact:479239644873');
	// The fixture's hyperdoc carries no `text` nodes — its content lives in
	// name/email/company. Flattening those to '' and then dropping the tree
	// deleted the contact's details outright: the very defect this simplifier
	// exists to fix, reintroduced the moment Simplify defaulted on for Live.
	assert.match(item.text, /Maria Johnson/);
	assert.match(item.text, /emailmaria@hubspot\.com/);
	assert.match(item.text, /HubSpot/);
	assert.ok(item.text.length <= 2000, `bounded, got ${item.text.length}`);
});

test('live: a simplified document is dramatically smaller than the raw one', async () => {
	const body = 'y'.repeat(200000);
	const envelope = {
		documents: [
			{
				resource_id: 'big',
				document: { type: 'document', children: [{ type: 'paragraph', text: body }] },
			},
		],
		indexed: false,
		notes: [],
	};
	const [raw] = await call(unwrapLiveEnvelope, envelope, { simplify: false });
	const [bounded] = await call(unwrapLiveEnvelope, envelope);
	const rawSize = JSON.stringify(raw.json).length;
	const boundedSize = JSON.stringify(bounded.json).length;
	assert.ok(rawSize > 100000, `precondition: raw is large (${rawSize})`);
	assert.ok(boundedSize < 2500, `bounded must be small, got ${boundedSize}`);
});

test('live list: a long text node is capped, not passed through', async () => {
	// PROD_CURSOR_PAGE is a verbatim prod recording and stays that way; an
	// unbounded live-list payload needs its own fixture to be caught, because
	// that one has no text nodes at all.
	const page = {
		items: [
			{
				resource_id: 'big',
				source: 'hubspot',
				document: { type: 'document', children: [{ type: 'paragraph', text: 'q'.repeat(80000) }] },
			},
		],
		next_cursor: null,
	};

	const out = await call(unwrapCursorPage, page);
	const item = out[0].json;
	assert.equal(item.document, undefined, 'tree dropped');
	assert.ok(item.text.length <= 2000, `capped, got ${item.text.length}`);
	assert.ok(JSON.stringify(item).length < 2500, 'the whole row stays small');
});
