import type { INodeProperties } from 'n8n-workflow';

const showOnlyForLiveGet = {
	resource: ['live'],
	operation: ['getResource'],
};

export const liveGetDescription: INodeProperties[] = [
	{
		// Used in the request URL path ({{$parameter.resourceId}}), not sent as a field.
		displayName: 'Resource ID',
		name: 'resourceId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnlyForLiveGet },
		description: 'The ID of the resource to fetch live from the source',
	},
	{
		displayName: 'Index Result',
		name: 'index',
		type: 'boolean',
		default: false,
		displayOptions: { show: showOnlyForLiveGet },
		description: 'Whether to also queue the fetched resource for indexing so it is on-hand next time. The "indexed" and "notes" fields on each output item report what happened.',
		routing: { request: { qs: { index: '={{$value}}' } } },
	},
	{
		displayName: 'Connection ID',
		name: 'connection_id',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForLiveGet },
		description: 'Specific connection ID when the user has multiple connections for this source',
		routing: { request: { qs: { connection_id: '={{$value || undefined}}' } } },
	},
];
