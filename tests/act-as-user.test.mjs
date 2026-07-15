// Tests for the per-operation Act as User override (ENG-3313):
//   nodes/Hyperspell/resources/actAsUser.ts  (preSend + empty-result hint)
//   credentials/HyperspellApi.credentials.ts (function-form authenticate)
// Runs against the BUILT output (dist/) with Node's built-in test runner —
// zero extra deps: `npm test` (builds first) or `node --test tests/*.test.mjs`.
//
// Merge-order ground truth these tests encode (read from n8n-core dist,
// execution-engine/routing-node.js + request-helper-functions.js +
// n8n/dist/credentials-helper.js):
//   1. RoutingNode builds requestOptions from routing.request/send, then runs
//      every preSend (applyActAsUser included).
//   2. httpRequestWithAuthentication THEN calls the credential's authenticate
//      on the built options — credential authentication runs LAST.
//   3. The object-form IAuthenticateGeneric merge assigns every declared
//      header unconditionally (and resolveValue coerces falsy expression
//      results to '', never omitting the header) — i.e. the CREDENTIAL wins
//      over routing headers. That is why the credential uses the FUNCTION form
//      of authenticate, which yields to an existing X-As-User header.
// The composition tests below replay exactly that order: preSend first,
// credential authenticate second.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { applyActAsUser, hintAppScopedEmpty, actAsUserProperty, APP_SCOPED_EMPTY_HINT } = require(
	'../dist/nodes/Hyperspell/resources/actAsUser.js',
);
const { HyperspellApi } = require('../dist/credentials/HyperspellApi.credentials.js');

// Minimal IExecuteSingleFunctions stand-in: the real context resolves the
// resourceLocator {mode, value} envelope to a plain string when preSend/
// postReceive call getNodeParameter with { extractValue: true } (routing-node
// sets extractValue automatically for resourceLocator properties).
const ctx = ({ actAsUser = '', credentials = { asUser: '' }, credentialsError = false } = {}) => ({
	getNodeParameter: (name, fallback) => (name === 'actAsUser' ? actAsUser : fallback),
	getCredentials: async () => {
		if (credentialsError) throw new Error('credentials not available in this context');
		return credentials;
	},
});

const authenticate = (credentials, requestOptions) =>
	new HyperspellApi().authenticate(credentials, requestOptions);

// The headers requestDefaults + routing put on every request before auth runs.
const baseOptions = () => ({
	url: '/memories/query',
	headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

// ── applyActAsUser (preSend) ───────────────────────────────────────────────

test('preSend: non-empty operation value sets X-As-User', async () => {
	const out = await applyActAsUser.call(ctx({ actAsUser: 'user_2abc123' }), baseOptions());
	assert.equal(out.headers['X-As-User'], 'user_2abc123');
	assert.equal(out.headers.Accept, 'application/json', 'existing headers survive');
});

test('preSend: empty value leaves the header unset (credential fallback stays possible)', async () => {
	for (const value of ['', '   ']) {
		const out = await applyActAsUser.call(ctx({ actAsUser: value }), baseOptions());
		assert.ok(!('X-As-User' in out.headers), `value=${JSON.stringify(value)}`);
	}
});

test('preSend: value is trimmed', async () => {
	const out = await applyActAsUser.call(ctx({ actAsUser: '  jane@acme.com ' }), baseOptions());
	assert.equal(out.headers['X-As-User'], 'jane@acme.com');
});

// ── credential authenticate (function form) ────────────────────────────────

test('authenticate: always sets Authorization bearer', async () => {
	const out = await authenticate({ apiKey: 'hs_key', asUser: '' }, baseOptions());
	assert.equal(out.headers.Authorization, 'Bearer hs_key');
});

test('authenticate: credential asUser applies when the request has no X-As-User', async () => {
	const out = await authenticate({ apiKey: 'k', asUser: 'cred-user' }, baseOptions());
	assert.equal(out.headers['X-As-User'], 'cred-user');
});

test('authenticate: an X-As-User already on the request WINS over the credential', async () => {
	const options = baseOptions();
	options.headers['X-As-User'] = 'op-user';
	const out = await authenticate({ apiKey: 'k', asUser: 'cred-user' }, options);
	assert.equal(out.headers['X-As-User'], 'op-user');
});

test('authenticate: both empty → header fully omitted, never an empty string', async () => {
	// The old IAuthenticateGeneric expression `={{$credentials.asUser || undefined}}`
	// could not do this: CredentialsHelper.resolveValue coerces falsy expression
	// results to '', and the API treats an empty X-As-User as a distinct,
	// dataless identity.
	const out = await authenticate({ apiKey: 'k', asUser: '' }, baseOptions());
	assert.ok(!('X-As-User' in out.headers));
});

test('authenticate: whitespace-only values are treated as empty', async () => {
	const options = baseOptions();
	options.headers['X-As-User'] = '   ';
	const out = await authenticate({ apiKey: 'k', asUser: '  ' }, options);
	assert.ok(!('X-As-User' in out.headers));
});

// ── full request path: preSend then credential auth, in n8n-core's order ───

test('composed: operation value overrides credential value end-to-end', async () => {
	let options = baseOptions();
	options = await applyActAsUser.call(ctx({ actAsUser: 'op-user' }), options);
	options = await authenticate({ apiKey: 'k', asUser: 'cred-user' }, options);
	assert.equal(options.headers['X-As-User'], 'op-user');
	assert.equal(options.headers.Authorization, 'Bearer k');
});

test('composed: empty operation value falls back to the credential', async () => {
	let options = baseOptions();
	options = await applyActAsUser.call(ctx({ actAsUser: '' }), options);
	options = await authenticate({ apiKey: 'k', asUser: 'cred-user' }, options);
	assert.equal(options.headers['X-As-User'], 'cred-user');
});

test('composed: both empty → app-scoped request with no X-As-User header', async () => {
	let options = baseOptions();
	options = await applyActAsUser.call(ctx({ actAsUser: '' }), options);
	options = await authenticate({ apiKey: 'k', asUser: '' }, options);
	assert.ok(!('X-As-User' in options.headers));
});

// ── hintAppScopedEmpty (postReceive) ───────────────────────────────────────

const item = (json) => ({ json });

test('hint: empty search body with no user anywhere → ONE notice item appended', async () => {
	// /memories/query app-scoped shape: no documents (plus per-source
	// "No results found for source X" notices upstream).
	const items = [item({ documents: [], answer: null })];
	const out = await hintAppScopedEmpty.call(ctx(), items);
	assert.equal(out.length, 2);
	assert.deepEqual(out[0], items[0], 'existing data is never removed');
	assert.equal(out[1].json.notice, APP_SCOPED_EMPTY_HINT);
});

test('hint: zero items (live unwrap empty page) with no user → notice item', async () => {
	const out = await hintAppScopedEmpty.call(ctx(), []);
	assert.equal(out.length, 1);
	assert.equal(out[0].json.notice, APP_SCOPED_EMPTY_HINT);
});

test('hint: results present → untouched, no notice', async () => {
	for (const items of [
		[item({ documents: [{ resource_id: 'a' }], answer: 'x' })],
		[item({ items: [{ resource_id: 'b' }] })],
		// Unwrapped live document rows have no envelope keys at all.
		[item({ resource_id: 'c', document: { type: 'document' }, indexed: false, notes: [] })],
	]) {
		const out = await hintAppScopedEmpty.call(ctx(), items);
		assert.deepEqual(out, items);
	}
});

test('hint: operation Act as User set → empty result is a real answer, no notice', async () => {
	const out = await hintAppScopedEmpty.call(ctx({ actAsUser: 'user_2abc' }), [
		item({ documents: [] }),
	]);
	assert.equal(out.length, 1);
});

test('hint: credential asUser set → no notice', async () => {
	const out = await hintAppScopedEmpty.call(ctx({ credentials: { asUser: 'cred-user' } }), [
		item({ documents: [] }),
	]);
	assert.equal(out.length, 1);
});

test('hint: credentials unreadable in postReceive context → still hints on empty', async () => {
	const out = await hintAppScopedEmpty.call(ctx({ credentialsError: true }), []);
	assert.equal(out.length, 1);
	assert.equal(out[0].json.notice, APP_SCOPED_EMPTY_HINT);
});

test('hint: live empty-fetch envelope item (documents: [] with notes) still gets the notice', async () => {
	const envelope = item({ documents: [], indexed: false, notes: ['indexing skipped'] });
	const out = await hintAppScopedEmpty.call(ctx(), [envelope]);
	assert.equal(out.length, 2);
	assert.deepEqual(out[0], envelope);
});

// ── property shape ─────────────────────────────────────────────────────────

test('actAsUserProperty: resourceLocator with From list + By ID modes, wired to the preSend', () => {
	const prop = actAsUserProperty('search');
	assert.equal(prop.name, 'actAsUser');
	assert.equal(prop.type, 'resourceLocator');
	assert.deepEqual(prop.default, { mode: 'id', value: '' }, 'By ID stays the default mode');
	assert.equal(prop.modes.length, 2);
	assert.equal(prop.modes[0].name, 'list');
	assert.equal(prop.modes[0].typeOptions.searchListMethod, 'getUsers');
	assert.equal(prop.modes[0].typeOptions.searchable, true);
	assert.equal(prop.modes[1].name, 'id');
	assert.deepEqual(prop.displayOptions, { show: { resource: ['search'] } });
	assert.equal(prop.routing.send.preSend[0], applyActAsUser);
	assert.match(prop.description, /Clerk ID/);
	assert.match(prop.description, /NOT the display name/);
});
