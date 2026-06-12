import type { INodeProperties } from 'n8n-workflow';

const showOnlyForLiveList = {
	resource: ['live'],
	operation: ['listResources'],
};

export const liveListDescription: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: showOnlyForLiveList },
		description: 'Whether to return all results or only up to a given limit',
		routing: {
			send: {
				paginate: '={{ $value }}',
				type: 'query',
				property: 'size',
				value: '100',
			},
			operations: {
				pagination: {
					type: 'generic',
					properties: {
						// The live cursor is opaque and integration-defined; pass next_cursor back verbatim.
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
		typeOptions: { minValue: 1, maxValue: 100 },
		displayOptions: {
			show: { ...showOnlyForLiveList, returnAll: [false] },
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
	{
		displayName: 'Connection ID',
		name: 'connection_id',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForLiveList },
		description: 'Specific connection ID when the user has multiple connections for this source',
		routing: { request: { qs: { connection_id: '={{$value || undefined}}' } } },
	},
];
