import type { INodeProperties } from 'n8n-workflow';
import { PAGED_QS, sourceOptions } from '../shared';
import { simplifyProperty } from '../simplify';

const showOnlyForDocumentList = {
	operation: ['list'],
	resource: ['document'],
};

export const documentListDescription: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: showOnlyForDocumentList },
		description: 'Whether to return all results or only up to a given limit',
		routing: {
			send: {
				paginate: '={{ $value }}',
				type: 'query',
				// `size`, NOT `limit`: /memories/list takes CursorParams (api/utils.py
				// — `size`, default 50, max 100) and FastAPI drops unknown query
				// params silently, so the `limit` this used to send was a no-op. Every
				// page came back at the server default of 50 full documents no matter
				// what the user asked for.
				property: 'size',
				value: '100',
			},
			operations: {
				pagination: {
					type: 'generic',
					properties: {
						continue: '={{ !!$response.body?.next_cursor }}',
						request: {
							// Spread $request.qs — do NOT set `cursor` alone. n8n merges the
							// paginated request over the base one with a SHALLOW spread
							// (routing-node.js: `{...requestData.options, ...paginateRequestData}`),
							// so a bare `{ qs: { cursor } }` REPLACES the whole qs object and
							// silently drops every filter. Turning Return All on used to wipe
							// source, status, the metadata filter and the page size — you asked
							// for "failed Slack documents" and paged through the entire app.
							// Verified against n8n 2.32.6 with a request-capture server.
							qs: PAGED_QS,
						},
					},
				},
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		// Capped at 100 to match the server (CursorParams: ge=0, le=100). The old
		// 250 was reachable in the UI but unreachable in fact — it only ever
		// trimmed a 50-row page client-side.
		typeOptions: { minValue: 1, maxValue: 100 },
		displayOptions: {
			show: { ...showOnlyForDocumentList, returnAll: [false] },
		},
		description: 'Max number of results to return',
		routing: {
			send: {
				type: 'query',
				property: 'size',
			},
			output: {
				maxResults: '={{$value}}',
			},
		},
	},
	// List is the node's biggest payload by far: it returns whole documents, and
	// a 50-row page of them measured 12.9 MB (~3.2M tokens) against a small test
	// app. Same toggle, same default, same reasoning as Search.
	simplifyProperty(showOnlyForDocumentList),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnlyForDocumentList },
		options: [
			{
				displayName: 'Source',
				name: 'source',
				type: 'options',
				default: 'vault',
				options: sourceOptions,
				description: 'Only return documents from this source',
				routing: { request: { qs: { source: '={{$value}}' } } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'completed',
				options: [
					{ name: 'Completed', value: 'completed' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Pending', value: 'pending' },
					{ name: 'Pending Review', value: 'pending_review' },
					{ name: 'Processing', value: 'processing' },
					{ name: 'Skipped', value: 'skipped' },
				],
				description: 'Only return documents in this status',
				routing: { request: { qs: { status: '={{$value}}' } } },
			},
			{
				displayName: 'Metadata Filter (JSON)',
				name: 'filter',
				type: 'json',
				default: '{}',
				description:
					'MongoDB-style metadata filter, e.g. {"department": "engineering", "priority": {"$gt": 3}}',
				routing: { request: { qs: { filter: '={{$value}}' } } },
			},
		],
	},
];
