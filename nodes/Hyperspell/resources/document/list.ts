import type { INodeProperties } from 'n8n-workflow';
import { sourceOptions } from '../shared';

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
				property: 'limit',
				value: '100',
			},
			operations: {
				pagination: {
					type: 'generic',
					properties: {
						continue: '={{ !!$response.body?.next_cursor }}',
						request: {
							qs: {
								cursor: '={{ $response.body.next_cursor }}',
							},
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
		typeOptions: { minValue: 1, maxValue: 250 },
		displayOptions: {
			show: { ...showOnlyForDocumentList, returnAll: [false] },
		},
		description: 'Max number of results to return',
		routing: {
			send: {
				type: 'query',
				property: 'limit',
			},
			output: {
				maxResults: '={{$value}}',
			},
		},
	},
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
