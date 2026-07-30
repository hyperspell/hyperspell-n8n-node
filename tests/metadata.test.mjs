// Guards the Metadata (JSON) field on Document -> Add
// (nodes/Hyperspell/resources/document/add.ts).
//
// The field used to route with `value: '={{ JSON.parse($value) }}'`. When
// JSON.parse throws inside an n8n expression the result is undefined, the key
// is dropped from the body, and the node reports SUCCESS. Captured against
// n8n 2.32.6, `{dept: eng}` produced a 200 with `metadata` absent from the
// request and no warning anywhere — the document is indexed with no metadata
// and every downstream metadata filter silently fails to match it.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { sendMetadata } = require('../dist/nodes/Hyperspell/resources/document/add.js');

function ctx(metadata) {
	return {
		getNodeParameter: (name, fallback) =>
			name === 'additionalFields' ? (metadata === undefined ? {} : { metadata }) : fallback,
		getNode: () => ({ name: 'Hyperspell', type: 'n8n-nodes-hyperspell.hyperspell' }),
	};
}
const req = () => ({ body: { text: 'body' } });

test('a valid object lands on the request body', async () => {
	const out = await sendMetadata.call(ctx('{"dept":"eng","n":3}'), req());
	assert.deepEqual(out.body.metadata, { dept: 'eng', n: 3 });
});

test('INVALID JSON throws instead of silently sending nothing', async () => {
	await assert.rejects(
		() => sendMetadata.call(ctx('{dept: eng}'), req()),
		(e) => {
			assert.match(e.message, /Metadata is not valid JSON/);
			return true;
		},
	);
});

test('a JSON array is rejected — metadata is a key/value object', async () => {
	await assert.rejects(
		() => sendMetadata.call(ctx('[1,2,3]'), req()),
		(e) => {
			assert.match(e.message, /must be a JSON object, got an array/);
			return true;
		},
	);
});

for (const [label, value, shown] of [
	['null', 'null', 'null'],
	['a bare number', '42', 'number'],
	['a bare string', '"hello"', 'string'],
]) {
	test(`${label} is rejected`, async () => {
		await assert.rejects(
			() => sendMetadata.call(ctx(value), req()),
			(e) => {
				assert.match(e.message, new RegExp(`must be a JSON object, got ${shown}`));
				return true;
			},
		);
	});
}

test('an untouched field sends no metadata key at all', async () => {
	for (const empty of [undefined, '', '{}']) {
		const out = await sendMetadata.call(ctx(empty), req());
		assert.ok(!('metadata' in out.body), `expected no metadata key for ${JSON.stringify(empty)}`);
	}
});

test('an expression-supplied object is accepted without re-parsing', async () => {
	// n8n hands back an already-parsed object when the field is fed by an
	// expression rather than typed literally.
	const out = await sendMetadata.call(ctx({ dept: 'eng' }), req());
	assert.deepEqual(out.body.metadata, { dept: 'eng' });
});

test('nested values pass through — the SERVER owns that rule, not the node', async () => {
	// api/metadata.py validate_metadata rejects dict values. Duplicating the key
	// and value rules here would give us two rulebooks to drift apart; the node
	// only guarantees it never claims to have sent metadata it dropped.
	const out = await sendMetadata.call(ctx('{"a":{"b":1}}'), req());
	assert.deepEqual(out.body.metadata, { a: { b: 1 } });
});

test('existing body fields survive', async () => {
	const out = await sendMetadata.call(ctx('{"k":"v"}'), req());
	assert.equal(out.body.text, 'body');
});
