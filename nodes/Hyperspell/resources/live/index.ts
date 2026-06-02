import type { INodeProperties } from 'n8n-workflow';
import { sourceOptions } from '../shared';
import { liveSearchDescription } from './search';
import { liveGetDescription } from './get';
import { liveListDescription } from './list';

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
		options: sourceOptions,
		displayOptions: {
			show: { resource: ['live'], operation: ['search', 'getResource', 'listResources'] },
		},
		description:
			'The connected source to access live. Call List Sources first to see which sources support which operations.',
	},
	...liveSearchDescription,
	...liveGetDescription,
	...liveListDescription,
];
