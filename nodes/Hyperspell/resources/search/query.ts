import type {
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';
import { sourceOptions } from '../shared';

const showOnlyForSearch = {
	resource: ['search'],
	operation: ['search', 'answer'],
};

// Every selectable provider EXCEPT the local Vault. Used to expand an empty
// Sources selection into "search everything connected" — the sensible default
// for a company-brain / AI-agent workflow. Historically an empty selection fell
// through to the API's Vault-only default, so an AI Agent node (which rarely
// fills optional params) got zero results from every query even though Slack,
// GitHub, Drive, etc. were connected. (Intent incident, 2026-07.)
const ALL_NON_VAULT_SOURCES = sourceOptions
	.map((option) => option.value as string)
	.filter((value) => value !== 'vault');

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
		// Promoted to a top-level field (previously buried in "Options") so it
		// appears in the auto-generated AI-tool schema and is visible to humans —
		// the one setting that decides whether search returns anything shouldn't
		// be optional-and-hidden.
		displayName: 'Sources',
		name: 'sources',
		type: 'multiOptions',
		default: [],
		options: sourceOptions,
		displayOptions: { show: showOnlyForSearch },
		description:
			'Which sources to search. Leave empty to search ALL connected sources (recommended for agents). Select specific sources (e.g. Vault, Slack, GitHub) to narrow the scope.',
		routing: {
			send: {
				// Don't route the raw value — an empty multiOptions would send
				// `sources: []`, which the API treats as "no valid sources" and
				// returns zero documents. Instead compute the effective list in
				// preSend: empty → all connected sources; otherwise the selection.
				preSend: [
					async function (
						this: IExecuteSingleFunctions,
						requestOptions: IHttpRequestOptions,
					): Promise<IHttpRequestOptions> {
						const selected = (this.getNodeParameter('sources', []) as string[]) ?? [];
						const body = (requestOptions.body as Record<string, unknown>) ?? {};
						body.sources = selected.length > 0 ? selected : ALL_NON_VAULT_SOURCES;
						requestOptions.body = body;
						return requestOptions;
					},
				],
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
		],
	},
];
