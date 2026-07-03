import type { INodeProperties } from 'n8n-workflow';
import { sourceOptions } from '../shared';

const showOnlyForSearch = {
	resource: ['search'],
	operation: ['search', 'answer'],
};

export const searchQueryDescription: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForSearch },
		description: 'The natural-language query to run against Hyperspell',
		routing: {
			send: {
				type: 'body',
				property: 'query',
			},
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showOnlyForSearch },
		options: [
			{
				displayName: 'Effort',
				name: 'effort',
				type: 'options',
				default: 'minimal',
				options: [
					{
						name: 'Minimal',
						value: 'minimal',
						description: 'Use the query verbatim — fastest, no LLM rewrite',
					},
					{ name: 'Low', value: 'low' },
					{ name: 'Medium', value: 'medium' },
					{
						name: 'High',
						value: 'high',
						description: 'Maximum LLM pre-processing — query rewrite, date extraction, multi-step retrieval',
					},
				],
				description: 'How much pre-processing to do on the query before retrieval',
				routing: {
					send: {
						type: 'body',
						property: 'effort',
					},
				},
			},
			{
				displayName: 'Sources',
				name: 'sources',
				type: 'multiOptions',
				default: [],
				options: sourceOptions,
				description:
					'Select one or more sources to query (e.g. Lightfield, Gmail, Slack). If left empty, ALL sources (Vault + every connected integration) are searched. Note: the bare API defaults an omitted sources to Vault only — the node overrides that with the full list.',
				routing: {
					send: {
						type: 'body',
						property: 'sources',
						// An empty selection resolves to undefined so the operation's
						// all-sources base body wins — sending a literal [] would make
						// the API return zero results with a "no valid sources" error.
						value: '={{ $value && $value.length ? $value : undefined }}',
					},
				},
			},
		],
	},
];
