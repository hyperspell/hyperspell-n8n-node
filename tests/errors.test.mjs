// Guards API-error surfacing (nodes/Hyperspell/resources/errors.ts).
//
// n8n's NodeApiError picked Hyperspell's error CODE over its explanation
// (POSSIBLE_ERROR_MESSAGE_KEYS lists `error` before `message`) and then
// overwrote even that with STATUS_CODE_MESSAGES. Captured against n8n 2.32.6
// on live prod keys, both of these showed as
// "Forbidden - perhaps check your credentials?" — when the credentials were
// fine and the problem was the key's pinned user / missing scope:
//
//   "This API key is scoped to a specific user; X-As-User must match..."
//   "Missing scopes: ['memories:write']"
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { raiseApiErrors } = require('../dist/nodes/Hyperspell/resources/errors.js');
const { Hyperspell } = require('../dist/nodes/Hyperspell/Hyperspell.node.js');

const ctx = { getNode: () => ({ name: 'Hyperspell', type: 'n8n-nodes-hyperspell.hyperspell' }) };
const ok = [{ json: { documents: [] } }];
const res = (statusCode, body) => ({ statusCode, body, headers: {} });

test('a 2xx passes straight through', async () => {
	const out = await raiseApiErrors.call(ctx, ok, res(200, { documents: [] }));
	assert.equal(out, ok);
});

test("a Hyperspell error surfaces its message, not its code", async () => {
	await assert.rejects(
		() =>
			raiseApiErrors.call(ctx, ok, res(403, {
				message: 'This API key is scoped to a specific user; X-As-User must match that user or be omitted.',
				error: 'WrongUser',
			})),
		(e) => {
			assert.match(e.message, /scoped to a specific user/);
			assert.doesNotMatch(e.message, /perhaps check your credentials/);
			assert.match(e.description ?? '', /WrongUser/);
			return true;
		},
	);
});

test('a scope rejection names the missing scope', async () => {
	await assert.rejects(
		() => raiseApiErrors.call(ctx, ok, res(403, { message: "Missing scopes: ['memories:write']", error: 'WrongScopes' })),
		(e) => {
			assert.match(e.message, /Missing scopes/);
			return true;
		},
	);
});

test("FastAPI's {detail: string} is surfaced", async () => {
	await assert.rejects(
		() => raiseApiErrors.call(ctx, ok, res(403, { detail: 'A user-scoped API key cannot perform app-wide operations.' })),
		(e) => {
			assert.match(e.message, /cannot perform app-wide operations/);
			return true;
		},
	);
});

test("FastAPI's 422 validation array is flattened to something readable", async () => {
	await assert.rejects(
		() => raiseApiErrors.call(ctx, ok, res(422, { detail: [{ loc: ['body', 'query'], msg: 'field required' }] })),
		(e) => {
			assert.match(e.message, /field required/);
			assert.match(e.message, /body\.query/);
			return true;
		},
	);
});

test('an unhelpful body still raises rather than passing through', async () => {
	for (const body of [{}, null, '']) {
		await assert.rejects(() => raiseApiErrors.call(ctx, ok, res(500, body)));
	}
});

// The load-bearing invariant. `ignoreHttpStatusErrors` is set globally, so an
// operation WITHOUT raiseApiErrors would hand a 4xx body to the workflow as if
// it were a result — a silent failure strictly worse than the bad message this
// whole file exists to fix.
test('EVERY operation raises API errors first', () => {
	const description = new Hyperspell().description;
	assert.equal(description.requestDefaults.ignoreHttpStatusErrors, true);

	const operations = description.properties.filter((p) => p.name === 'operation');
	assert.ok(operations.length > 0, 'expected operation properties');

	let checked = 0;
	for (const property of operations) {
		for (const option of property.options) {
			const postReceive = option.routing?.output?.postReceive;
			assert.ok(
				Array.isArray(postReceive) && postReceive[0]?.name === 'raiseApiErrors',
				`operation "${option.value}" must run raiseApiErrors first, got ${
					Array.isArray(postReceive) ? postReceive.map((f) => f.name).join(', ') : '(none)'
				}`,
			);
			checked++;
		}
	}
	assert.equal(checked, 10, 'expected all 10 operations to be checked');
});
