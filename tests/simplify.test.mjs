// Tests for document-tree simplification (nodes/Hyperspell/resources/simplify.ts),
// shared by Search/Answer (`documents`) and Document List (`items`).
// Runs against the BUILT output (dist/) with Node's built-in test runner — zero extra deps:
// `npm test` (builds first) or `node --test tests/*.test.mjs` after a build.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { simplifyDocuments } = require(
	'../dist/nodes/Hyperspell/resources/simplify.js',
);

// Real-shape fixture: verbatim prod `POST /memories/query` response bytes
// (app 994 david-szarzynski-test, 2026-07-29, answer=true, all sources), with
// the long prose truncated. Recorded from the live API rather than hand-rolled
// so backend schema drift can't hide behind an idealized fixture. The key
// property it preserves: `document` repeats, in full, text that `highlights[]`
// and `summary` already carry — for a large source file that repetition is the
// difference between a few KB and a few MB.
const MATCHED_TEXT = 'Reflecting on a decision I made: choosing to spend actual money.';
const PROD_QUERY_RESPONSE = {
	query_id: '2berZHN96b3Wsw',
	answer: 'The search completed, but no supported answer was found in the available data.',
	documents: [
		{
			resource_id: 'ws-e3ce512700ccf528',
			source: 'vault',
			type: 'document',
			title: 'memory/2026-02-06.md',
			status: 'completed',
			metadata: { owner: 'a-linea', category: 'memory', source_kind: 'workspace-file' },
			ingested_at: '2026-07-13T17:34:09.512250',
			last_modified_at: '2026-07-13T17:43:00.512385',
			document_date: '2026-07-13T17:34:00.615940',
			document: {
				type: 'document',
				id: '7263ac378df1',
				title: 'memory/2026-02-06.md',
				children: [{ type: 'paragraph', id: '747bd965d07d', text: MATCHED_TEXT }],
			},
			score: 0.1732882059293266,
			highlights: [
				{ id: '1KVbCmZgG3OqSw', score: 0.1732882059293266, comments: [], text: MATCHED_TEXT },
			],
			summary: MATCHED_TEXT,
		},
	],
	errors: [
		{ error: 'IntegrationNotSupported', message: 'The source box is not supported yet.' },
	],
};

/** Minimal IExecuteSingleFunctions stand-in: postReceive only reads `options`. */
function ctx(options = {}) {
	return {
		getNodeParameter(name, fallback) {
			return name === 'simplify' ? (options.simplify ?? fallback) : fallback;
		},
	};
}

const item = (json) => [{ json: structuredClone(json) }];

test('simplify (default) drops the hyperdoc tree and keeps the matched text', async () => {
	const [out] = await simplifyDocuments.call(ctx(), item(PROD_QUERY_RESPONSE));
	const [doc] = out.json.documents;

	assert.equal(doc.document, undefined, 'the unbounded document tree must be gone');
	assert.equal(doc.highlights, undefined, 'highlights are folded into `text`');
	assert.equal(doc.summary, undefined, 'summary is folded into `text`');
	assert.equal(doc.text, MATCHED_TEXT);
	assert.equal(doc.resource_id, 'ws-e3ce512700ccf528');
	assert.equal(doc.source, 'vault');
	assert.equal(doc.title, 'memory/2026-02-06.md');
	assert.equal(doc.score, 0.1732882059293266);
	assert.deepEqual(doc.metadata, PROD_QUERY_RESPONSE.documents[0].metadata);
	assert.equal(doc.document_date, '2026-07-13T17:34:00.615940');
});

test('simplify preserves the envelope around the documents', async () => {
	const [out] = await simplifyDocuments.call(ctx(), item(PROD_QUERY_RESPONSE));

	assert.equal(out.json.query_id, PROD_QUERY_RESPONSE.query_id);
	assert.equal(out.json.answer, PROD_QUERY_RESPONSE.answer);
	assert.deepEqual(out.json.errors, PROD_QUERY_RESPONSE.errors);
	assert.equal(out.json.documents.length, 1);
});

test('simplify shrinks the payload — the whole point of the option', async () => {
	const [out] = await simplifyDocuments.call(ctx(), item(PROD_QUERY_RESPONSE));

	const raw = JSON.stringify(PROD_QUERY_RESPONSE).length;
	const simplified = JSON.stringify(out.json).length;
	assert.ok(simplified < raw, `expected shrink, got ${raw} → ${simplified}`);
});

test('Simplify = false passes the raw response through untouched', async () => {
	const input = item(PROD_QUERY_RESPONSE);
	const out = await simplifyDocuments.call(ctx({ simplify: false }), input);

	assert.deepEqual(out, input);
	assert.deepEqual(out[0].json.documents[0].document, PROD_QUERY_RESPONSE.documents[0].document);
});

test('a workflow saved before the option existed still gets simplified', async () => {
	// n8n strips undeclared collection keys, so pre-0.7.0 workflows arrive with an
	// `options` object that has no `simplify` at all — it must not read as false.
	const [out] = await simplifyDocuments.call(ctx({ effort: 'minimal' }), item(PROD_QUERY_RESPONSE));

	assert.equal(out.json.documents[0].document, undefined);
});

test('falls back to concatenated highlights when the server sends no summary', async () => {
	const response = structuredClone(PROD_QUERY_RESPONSE);
	delete response.documents[0].summary;
	response.documents[0].highlights = [{ text: 'first chunk' }, { text: 'second chunk' }];

	const [out] = await simplifyDocuments.call(ctx(), item(response));

	assert.equal(out.json.documents[0].text, 'first chunk\n\nsecond chunk');
});

test('a hit with neither summary nor highlights yields empty text, not undefined', async () => {
	const response = structuredClone(PROD_QUERY_RESPONSE);
	delete response.documents[0].summary;
	delete response.documents[0].highlights;

	const [out] = await simplifyDocuments.call(ctx(), item(response));

	assert.equal(out.json.documents[0].text, '');
});

test('a body with no documents array is left alone', async () => {
	// The app-scoped-empty notice item and any error body flow through here too.
	const notice = { notice: 'No results — no Act as User was set.' };
	const [out] = await simplifyDocuments.call(ctx(), item(notice));

	assert.deepEqual(out.json, notice);
});

test('an empty result set stays an empty array so the empty-hint still fires', async () => {
	const [out] = await simplifyDocuments.call(
		ctx(),
		item({ query_id: 'abc', documents: [], answer: null }),
	);

	assert.deepEqual(out.json.documents, []);
});

// ---------------------------------------------------------------------------
// Document → List shares the same postReceive, keyed on `items` not `documents`.
// Verbatim prod `GET /memories/list?size=1` row shape (app 994, 2026-07-29):
// list rows carry `status` and no `score`, the mirror image of a query hit.
// ---------------------------------------------------------------------------
const PROD_LIST_PAGE = {
	items: [
		{
			resource_id: 'ws-e3ce512700ccf528',
			source: 'vault',
			type: 'document',
			title: 'memory/2026-02-06.md',
			status: 'completed',
			metadata: { category: 'memory' },
			ingested_at: '2026-07-13T17:34:09.512250',
			last_modified_at: '2026-07-13T17:43:00.512385',
			document_date: '2026-07-13T17:34:00.615940',
			document: { type: 'document', id: '7263ac378df1', children: [{ type: 'paragraph', text: 'body' }] },
		},
	],
	next_cursor: 'opaque-cursor-token',
};

test('list: the same toggle simplifies `items` and keeps next_cursor', async () => {
	const [out] = await simplifyDocuments.call(ctx(), item(PROD_LIST_PAGE));
	const [row] = out.json.items;

	assert.equal(row.document, undefined, 'the unbounded document tree must be gone');
	assert.equal(out.json.next_cursor, 'opaque-cursor-token', 'paging handle must survive');
	assert.equal(out.json.items.length, 1);
});

test('list: rows keep `status` and gain no phantom `score`', async () => {
	// A query hit has score-and-no-status; a list row is the reverse. Neither
	// should acquire a null field it never had — downstream IF nodes check these.
	const [out] = await simplifyDocuments.call(ctx(), item(PROD_LIST_PAGE));
	const [row] = out.json.items;

	assert.equal(row.status, 'completed');
	assert.ok(!('score' in row), 'list rows have no score; do not invent one');
});

test('query hits keep `score` and gain no phantom `status`', async () => {
	const response = structuredClone(PROD_QUERY_RESPONSE);
	delete response.documents[0].status;

	const [out] = await simplifyDocuments.call(ctx(), item(response));

	assert.equal(out.json.documents[0].score, 0.1732882059293266);
	assert.ok(!('status' in out.json.documents[0]), 'query hits have no status; do not invent one');
});

test('list: Simplify = false leaves the page untouched', async () => {
	const input = item(PROD_LIST_PAGE);
	const out = await simplifyDocuments.call(ctx({ simplify: false }), input);

	assert.deepEqual(out, input);
});
