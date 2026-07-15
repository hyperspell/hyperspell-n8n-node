import type { INodeProperties } from 'n8n-workflow';
import { hintAppScopedEmpty } from '../actAsUser';
import { sourceOptions } from '../shared';
import { unwrapCursorPage, unwrapLiveEnvelope } from './output';
import { liveSearchDescription } from './search';
import { liveGetDescription } from './get';
import { liveListDescription } from './list';

// Vault is Hyperspell's internal store — always indexed, never a connected
// source — so it can't be queried live. Every other source qualifies.
const liveSourceOptions = sourceOptions.filter((o) => o.value !== 'vault');

const showOnlyForLive = {
	resource: ['live'],
};

export const liveDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForLive },
		options: [
			{
				name: 'List Sources',
				value: 'listSources',
				action: 'List live queryable sources',
				description: 'List connected sources and the live capabilities (search, fetch, list) each supports',
				routing: {
					request: {
						method: 'GET',
						url: '/live/sources',
					},
					// One notice item when the response is empty because no Act as
					// User was set anywhere — connections are per-user, so an
					// app-scoped call lists nothing.
					output: {
						postReceive: [hintAppScopedEmpty],
					},
				},
			},
			{
				name: 'Search',
				value: 'search',
				action: 'Search a source live',
				description: 'Search a connected source live for data that may not be indexed yet',
				routing: {
					request: {
						method: 'POST',
						url: '=/live/{{$parameter.source}}/search',
					},
					// One item per document, with the envelope's indexed/notes merged onto each (see output.ts).
					// The scoping hint runs after the unwrap so it sees the final item shape.
					output: {
						postReceive: [unwrapLiveEnvelope, hintAppScopedEmpty],
					},
				},
			},
			{
				name: 'Get Resource',
				value: 'getResource',
				action: 'Fetch one resource live',
				description: 'Fetch a single resource live by its ID (may fan out into several documents)',
				routing: {
					request: {
						method: 'GET',
						url: '=/live/{{$parameter.source}}/resources/{{$parameter.resourceId}}',
					},
					// One item per document (a fetch may fan out), with the envelope's indexed/notes merged onto each (see output.ts).
					output: {
						postReceive: [unwrapLiveEnvelope, hintAppScopedEmpty],
					},
				},
			},
			{
				name: 'List Resources',
				value: 'listResources',
				action: 'List resources from a source live',
				description: "Paginate through a source's resources live",
				routing: {
					request: {
						method: 'GET',
						url: '=/live/{{$parameter.source}}/resources',
					},
					// One item per resource, with next_cursor merged onto each; auto-pagination reads the raw body (see output.ts).
					output: {
						postReceive: [unwrapCursorPage, hintAppScopedEmpty],
					},
				},
			},
		],
		default: 'search',
	},
	{
		// Used in the request URL path ({{$parameter.source}}) for all ops except List Sources.
		displayName: 'Source',
		name: 'source',
		type: 'options',
		default: 'notion',
		required: true,
		options: liveSourceOptions,
		displayOptions: {
			show: { resource: ['live'], operation: ['search', 'getResource', 'listResources'] },
		},
		description:
			'The connected source to access live. Call List Sources first to see which sources support which operations. Results are emitted one item per document; the body/content lives under the nested "document" hyperdoc tree, and envelope fields that are empty for a given row (e.g. timestamps) are omitted rather than null.',
	},
	...liveSearchDescription,
	...liveGetDescription,
	...liveListDescription,
];
