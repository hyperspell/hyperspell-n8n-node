import type { INodeProperties } from 'n8n-workflow';
import { connectionIdProperty } from './connectionId';

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
	connectionIdProperty(showOnlyForLiveGet, 'query'),
];
