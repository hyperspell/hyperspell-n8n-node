import type { INodeProperties } from 'n8n-workflow';
import { connectionIdProperty } from './connectionId';

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
			'Whether to also queue each hit for indexing so it is on-hand next time. No-op for live-only sources (e.g. Google Calendar) — the "notes" field on each output item explains any skip.',
		routing: {
			send: {
				type: 'body',
				property: 'index',
			},
		},
	},
	connectionIdProperty(showOnlyForLiveSearch),
];
