// Guards the cursor-pagination query expression (nodes/Hyperspell/resources/shared.ts).
//
// n8n merges a paginated request over the base one with a SHALLOW spread, so a
// pagination block that returns a bare `{ cursor }` REPLACES the whole `qs` and
// silently drops every filter. That is not a hypothetical: captured against
// n8n 2.32.6, `Document List` with Return All on sent `query={}` — no source,
// no status, no metadata filter, no page size — and paged through the entire
// app instead of the filtered subset. Live List likewise dropped connection_id
// and queried the wrong connection.
//
// This test fails if anyone "tidies" the expression back to a plain object.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { PAGED_QS } = require('../dist/nodes/Hyperspell/resources/shared.js');
const documentList = require('../dist/nodes/Hyperspell/resources/document/list.js');
const liveList = require('../dist/nodes/Hyperspell/resources/live/list.js');

test('the paged qs is an expression that spreads the base query', () => {
	assert.equal(typeof PAGED_QS, 'string', 'must stay a resolvable n8n expression');
	assert.ok(PAGED_QS.startsWith('={{'), 'must be an expression, not a literal object');
	assert.match(PAGED_QS, /\.\.\.\$request\.qs/, 'must carry the base query params forward');
	assert.match(PAGED_QS, /cursor:\s*\$response\.body\?\.next_cursor/);
});

function paginationQs(properties) {
	const returnAll = properties.find((p) => p.name === 'returnAll');
	return returnAll?.routing?.operations?.pagination?.properties?.request?.qs;
}

test('Document List paginates with the spreading expression', () => {
	assert.equal(paginationQs(documentList.documentListDescription), PAGED_QS);
});

test('Live List Resources paginates with the spreading expression', () => {
	assert.equal(paginationQs(liveList.liveListDescription), PAGED_QS);
});

test('both list operations send the page size the API actually reads', () => {
	// `/memories/list` and `/live/{source}/resources` both take CursorParams
	// (api/utils.py: `size`, default 50, max 100). Document List sent `limit`
	// for months; FastAPI drops unknown query params silently, so the Limit
	// field never reached the server and every page fetched 50 whole documents.
	for (const [label, props] of [
		['document', documentList.documentListDescription],
		['live', liveList.liveListDescription],
	]) {
		const limit = props.find((p) => p.name === 'limit');
		assert.equal(limit?.routing?.send?.property, 'size', `${label} Limit must send size`);
		assert.equal(limit?.typeOptions?.maxValue, 100, `${label} Limit must respect the API cap`);
		const returnAll = props.find((p) => p.name === 'returnAll');
		assert.equal(returnAll?.routing?.send?.property, 'size', `${label} Return All must send size`);
	}
});
