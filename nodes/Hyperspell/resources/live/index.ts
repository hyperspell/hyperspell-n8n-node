import type { INodeProperties } from 'n8n-workflow';
import { sourceOptions } from '../shared';
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
					// LiveResourceResponse { documents, indexed, notes } (ENG-2479 Hyperdoc envelope): emit each document as its own item.
					output: {
						postReceive: [{ type: 'rootProperty', properties: { property: 'documents' } }],
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
					// LiveResourceResponse { documents, ... }: a fetch may fan out into several documents — emit each as its own item.
					output: {
						postReceive: [{ type: 'rootProperty', properties: { property: 'documents' } }],
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
					// CursorPage { items, next_cursor }: emit each resource as its own item (pagination still reads next_cursor from the raw response).
					output: {
						postReceive: [{ type: 'rootProperty', properties: { property: 'items' } }],
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
			'The connected source to access live. Call List Sources first to see which sources support which operations. Each result item carries the document envelope (resource_id, source, type, title, status, timestamps); the body/content lives under the nested "document" hyperdoc tree.',
	},
	...liveSearchDescription,
	...liveGetDescription,
	...liveListDescription,
];
