// Tests for the Live Connection ID guard (nodes/Hyperspell/resources/live/connectionId.ts).
//
// Regression: on 2026-08-10 prod logged `connection_id` arriving as 'linear',
// 'github' and 'google_drive' — source names, not UUIDs. The node sets
// usableAsTool, so an AI Agent fills this field from its description, and the
// old wording ("Specific connection ID when the user has multiple connections
// for this source") reads as an invitation to name the source.
//
// Core puts that value straight into a UUID column
// (live_access.py: `stmt.where(Connection.id == connection_id)`), asyncpg
// raises DataError, and a blanket handler in api/live.py returns
// `502 "Upstream source error."` — blaming a provider that was never called.
//
// Reproduced directly against a local core on 2026-08-12:
//   POST /live/linear/search {"query":"test"}                        -> 400 ConnectionNotFound (clear)
//   POST /live/linear/search {"query":"test","connection_id":"linear"} -> 502 "Upstream source error."
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { validateConnectionId, connectionIdProperty } = require(
	'../dist/nodes/Hyperspell/resources/live/connectionId.js',
);

const ctx = (value) => ({
	getNodeParameter: (name, fallback) => (name === 'connection_id' ? value : fallback),
	getNode: () => ({ name: 'Hyperspell', type: 'n8n-nodes-hyperspell.hyperspellTool' }),
});

const req = () => ({ body: {}, qs: {}, url: '/live/linear/search', method: 'POST' });

test('a real connection UUID passes through untouched', async () => {
	const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
	const out = await validateConnectionId.call(ctx(uuid), req());
	assert.ok(out, 'request options returned');
});

test('an empty or whitespace value passes (the field is optional)', async () => {
	for (const value of ['', '   ', undefined]) {
		const out = await validateConnectionId.call(ctx(value), req());
		assert.ok(out, `value=${JSON.stringify(value)}`);
	}
});

test('a source name is rejected in the node, not sent as a 502-in-waiting', async () => {
	// The exact values prod saw.
	for (const value of ['linear', 'github', 'google_drive']) {
		await assert.rejects(
			async () => validateConnectionId.call(ctx(value), req()),
			(err) => {
				assert.match(err.message, /must be a connection UUID/);
				assert.match(err.message, new RegExp(value));
				return true;
			},
			`value=${value}`,
		);
	}
});

test('a non-UUID that is not a source name is still rejected', async () => {
	await assert.rejects(async () => validateConnectionId.call(ctx('12345'), req()), /connection UUID/);
});

test('rejection explains the fix, including the AI-tool case', async () => {
	try {
		await validateConnectionId.call(ctx('linear'), req());
		assert.fail('should have thrown');
	} catch (err) {
		const text = `${err.description ?? ''}`;
		assert.match(text, /not the source name/i);
		assert.match(text, /empty/i);
		assert.match(text, /AI Agent tool/i);
	}
});

test('the shared property wires the guard on both transports', () => {
	const body = connectionIdProperty({ resource: ['live'], operation: ['search'] });
	const query = connectionIdProperty({ resource: ['live'], operation: ['listResources'] }, 'query');

	assert.equal(body.routing.send.type, 'body');
	assert.equal(query.routing.send.type, 'query');
	for (const prop of [body, query]) {
		assert.equal(prop.name, 'connection_id');
		assert.equal(prop.routing.send.property, 'connection_id');
		assert.equal(prop.routing.send.preSend.length, 1);
		// Wording is the model's only input when used as a tool.
		assert.match(prop.description, /Leave empty/);
		assert.match(prop.description, /NOT the source name/);
	}
});
