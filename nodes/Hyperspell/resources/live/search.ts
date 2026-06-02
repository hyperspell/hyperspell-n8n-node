import type { INodeProperties } from 'n8n-workflow';

const showOnlyForLiveSearch = {
	resource: ['live'],
	operation: ['search'],
};

export const liveSearchDescription: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForLiveSearch },
		description: 'The natural-language query to run live against the source',
		routing: {
			send: {
				type: 'body',
				property: 'query',
			},
		},
	},
	{
		displayName: 'Index Results',
		name: 'index',
		type: 'boolean',
		default: false,
		displayOptions: { show: showOnlyForLiveSearch },
		description:
			'Whether to also queue each hit for indexing so it is on-hand next time. No-op for live-only sources (e.g. Google Calendar) — see "notes" in the response.',
		routing: {
			send: {
				type: 'body',
				property: 'index',
			},
		},
	},
	{
		displayName: 'Connection ID',
		name: 'connection_id',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForLiveSearch },
		description: 'Specific connection ID when the user has multiple connections for this source',
		routing: {
			send: {
				type: 'body',
				property: 'connection_id',
			},
		},
	},
];
