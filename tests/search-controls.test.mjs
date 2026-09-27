import assert from 'node:assert/strict';
import test from 'node:test';

import {
	resolveSearchControls,
	searchQueryDescription,
} from '../dist/nodes/Hyperspell/resources/search/query.js';

const context = (parameters) => ({
	getNodeParameter(name, fallback) {
		return Object.hasOwn(parameters, name) ? parameters[name] : fallback;
	},
});

const call = (parameters, body = {}) =>
	resolveSearchControls.call(context(parameters), { body });

test('new workflows send the visible top-level controls', async () => {
	const request = await call({ effort: 'high', maxResults: 50 }, { query: 'roadmap' });

	assert.deepEqual(request.body, {
		query: 'roadmap',
		effort: 'high',
		max_results: 50,
	});
});

test('untouched workflows receive the new defaults', async () => {
	const request = await call({});

	assert.equal(request.body.effort, 'very_high');
	assert.equal(request.body.max_results, 10);
});

test('saved legacy options override top-level defaults after upgrade', async () => {
	const request = await call({
		effort: 'very_high',
		maxResults: 10,
		options: { effort: 'minimal', maxResults: 200 },
	});

	assert.equal(request.body.effort, 'minimal');
	assert.equal(request.body.max_results, 200);
});

test('a partial legacy configuration preserves only its explicit value', async () => {
	const request = await call({
		effort: 'medium',
		maxResults: 25,
		options: { effort: 'low' },
	});

	assert.equal(request.body.effort, 'low');
	assert.equal(request.body.max_results, 25);
});

test('the legacy collection remains declared but hidden on search operations', () => {
	const legacy = searchQueryDescription.find((property) => property.name === 'options');
	const effort = searchQueryDescription.find((property) => property.name === 'effort');

	assert.deepEqual(legacy.displayOptions, {
		hide: { resource: ['document', 'live', 'search'] },
	});
	assert.equal(effort.routing.send.preSend[0], resolveSearchControls);
});
