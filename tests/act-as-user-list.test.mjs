// Tests for the Act as User "From list" dropdown (ENG-3313 PR 3):
//   nodes/Hyperspell/resources/actAsUser.ts (getUsers listSearch method)
//   nodes/Hyperspell/Hyperspell.node.ts     (methods.listSearch wiring)
// Runs against the BUILT output (dist/) with Node's built-in test runner —
// zero extra deps: `npm test` (builds first) or `node --test tests/*.test.mjs`.
//
// Endpoint contract (core monorepo, built in parallel — NOT deployed yet, so
// everything here mocks this.helpers.httpRequestWithAuthentication):
//   GET {baseUrl}/users?limit=50&offset=0  (Authorization only, no X-As-User)
//   200 → { users: [{ user_id, display_name|null, document_count,
//                     last_indexed|null }], total, limit, offset }
// The endpoint has NO search param — getUsers filters client-side — and the
// n8n paginationToken is the next offset.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getUsers, USERS_ENDPOINT_UNAVAILABLE_HINT } = require(
	'../dist/nodes/Hyperspell/resources/actAsUser.js',
);
const { Hyperspell } = require('../dist/nodes/Hyperspell/Hyperspell.node.js');

const user = (user_id, display_name = null, extra = {}) => ({
	user_id,
	display_name,
	document_count: 0,
	last_indexed: null,
	...extra,
});

const page = (users, total = users.length, offset = 0) => ({
	users,
	total,
	limit: 50,
	offset,
});

// Minimal ILoadOptionsFunctions stand-in: getUsers reads the credential for
// baseUrl and calls this.helpers.httpRequestWithAuthentication.call(this, ...).
const ctx = ({ response, error, baseUrl = 'https://api.example.com' } = {}) => {
	const calls = [];
	return {
		calls,
		getNode: () => ({ name: 'Hyperspell', type: 'hyperspell', typeVersion: 1 }),
		getCredentials: async () => ({ apiKey: 'hs_key', asUser: '', baseUrl }),
		helpers: {
			async httpRequestWithAuthentication(credentialsType, requestOptions) {
				calls.push({ credentialsType, requestOptions });
				if (error) throw error;
				return typeof response === 'function' ? response(requestOptions) : response;
			},
		},
	};
};

// ── request shape ───────────────────────────────────────────────────────────

test('getUsers: calls GET {baseUrl}/users with the hyperspellApi credential, limit 50, offset 0', async () => {
	const context = ctx({ response: page([]) , baseUrl: 'https://api.eu.example.com' });
	await getUsers.call(context);
	assert.equal(context.calls.length, 1);
	const { credentialsType, requestOptions } = context.calls[0];
	assert.equal(credentialsType, 'hyperspellApi');
	assert.equal(requestOptions.method, 'GET');
	assert.equal(requestOptions.baseURL, 'https://api.eu.example.com');
	assert.equal(requestOptions.url, '/users');
	assert.deepEqual(requestOptions.qs, { limit: 50, offset: 0 });
});

// ── result mapping ──────────────────────────────────────────────────────────

test('getUsers: maps display_name to "Name (user_id)", null display_name to bare user_id', async () => {
	const context = ctx({
		response: page([user('user_2abc', 'Jane Doe'), user('user_2def'), user('user_2ghi', '')]),
	});
	const out = await getUsers.call(context);
	assert.deepEqual(out.results, [
		{ name: 'Jane Doe (user_2abc)', value: 'user_2abc' },
		// null and '' display names both fall back to the raw user_id.
		{ name: 'user_2def', value: 'user_2def' },
		{ name: 'user_2ghi', value: 'user_2ghi' },
	]);
	assert.equal(out.paginationToken, undefined, 'single full result set → no next page');
});

// ── client-side search filtering ────────────────────────────────────────────

test('getUsers: filter matches user_id and display_name, case-insensitively', async () => {
	const users = [
		user('user_2abc', 'Jane Doe'),
		user('user_2def', 'John Smith'),
		user('jane@acme.com'),
	];
	const byName = await getUsers.call(ctx({ response: page(users) }), 'jane');
	assert.deepEqual(
		byName.results.map((r) => r.value),
		['user_2abc', 'jane@acme.com'],
		'matches display_name AND user_id',
	);
	const byId = await getUsers.call(ctx({ response: page(users) }), '2DEF');
	assert.deepEqual(byId.results.map((r) => r.value), ['user_2def']);
	const noMatch = await getUsers.call(ctx({ response: page(users) }), 'zzz');
	assert.deepEqual(noMatch.results, []);
});

test('getUsers: empty/whitespace filter returns everything', async () => {
	const users = [user('a'), user('b')];
	for (const filter of [undefined, '', '   ']) {
		const out = await getUsers.call(ctx({ response: page(users) }), filter);
		assert.equal(out.results.length, 2, `filter=${JSON.stringify(filter)}`);
	}
});

// ── pagination ──────────────────────────────────────────────────────────────

test('getUsers: paginationToken is the next offset while more pages remain', async () => {
	const fullPage = Array.from({ length: 50 }, (_, i) => user(`user_${i}`));
	const out = await getUsers.call(ctx({ response: page(fullPage, 120) }));
	assert.equal(out.paginationToken, '50');
});

test('getUsers: incoming paginationToken is sent as the offset', async () => {
	const context = ctx({ response: page([user('user_50')], 51, 50) });
	const out = await getUsers.call(context, undefined, '50');
	assert.deepEqual(context.calls[0].requestOptions.qs, { limit: 50, offset: 50 });
	assert.equal(out.paginationToken, undefined, 'offset 50 + 1 user = total 51 → last page');
});

test('getUsers: pagination advances by the RAW page size even when the filter drops rows', async () => {
	// 50 fetched, only 1 matches the filter — the next offset must still be 50,
	// or client-side filtering would skip users.
	const fullPage = Array.from({ length: 50 }, (_, i) =>
		user(`user_${i}`, i === 3 ? 'Jane Doe' : null),
	);
	const out = await getUsers.call(ctx({ response: page(fullPage, 200) }), 'jane');
	assert.equal(out.results.length, 1);
	assert.equal(out.paginationToken, '50');
});

test('getUsers: empty user list → no results, no pagination token', async () => {
	const out = await getUsers.call(ctx({ response: page([], 0) }));
	assert.deepEqual(out, { results: [], paginationToken: undefined });
});

// ── graceful failure (endpoint not deployed yet) ────────────────────────────

test('getUsers: a 404 (core without GET /users) throws the version hint, not an empty workspace', async () => {
	const notFound = Object.assign(new Error('404 - "Not Found"'), { httpCode: '404' });
	await assert.rejects(getUsers.call(ctx({ error: notFound })), (error) => {
		assert.equal(error.constructor.name, 'NodeOperationError');
		assert.equal(error.message, USERS_ENDPOINT_UNAVAILABLE_HINT);
		assert.match(error.message, /may not support GET \/users yet/);
		assert.match(error.message, /'By ID' mode/);
		return true;
	});
});

test('getUsers: any other request error also surfaces the hint (with the cause as description)', async () => {
	await assert.rejects(getUsers.call(ctx({ error: new Error('ECONNREFUSED') })), (error) => {
		assert.equal(error.message, USERS_ENDPOINT_UNAVAILABLE_HINT);
		assert.equal(error.description, 'ECONNREFUSED');
		return true;
	});
});

test('getUsers: a 200 with an unexpected shape (no users array) throws, never renders empty', async () => {
	for (const response of [{}, { users: 'nope' }, null]) {
		await assert.rejects(getUsers.call(ctx({ response })), (error) => {
			assert.equal(error.message, USERS_ENDPOINT_UNAVAILABLE_HINT);
			return true;
		});
	}
});

// ── node wiring ─────────────────────────────────────────────────────────────

test('Hyperspell node: methods.listSearch.getUsers is the exported getUsers', () => {
	const node = new Hyperspell();
	assert.equal(node.methods.listSearch.getUsers, getUsers);
});

test('Hyperspell node: every actAsUser property exposes the From list mode', () => {
	const node = new Hyperspell();
	const props = node.description.properties.filter((p) => p.name === 'actAsUser');
	assert.equal(props.length, 3, 'document, search, live');
	for (const prop of props) {
		assert.equal(prop.modes[0].name, 'list');
		assert.equal(prop.modes[0].typeOptions.searchListMethod, 'getUsers');
		assert.equal(prop.modes[0].typeOptions.searchable, true);
		assert.equal(prop.modes[1].name, 'id', 'By ID stays available for expressions/AI agents');
	}
});
