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

// Every selectable source, Vault included — Vault is where uploaded/canonical
// memories live, so "search everything" must cover it. Used to expand an empty
// Sources selection: historically an empty selection fell through to the API's
// Vault-ONLY default, so an AI Agent node (which rarely fills optional params)
// got zero results from every query even though Slack, GitHub, Drive, etc.
// were connected (Intent HQ incident, 2026-07).
const ALL_SOURCES = sourceOptions.map((option) => option.value as string);

// Compute the effective source scope in preSend rather than routing the raw
// value: an empty multiOptions would send `sources: []`, which the API answers
// with "no valid sources" and zero documents, and an OMITTED key scopes to
// Vault only. NOTE: a pre-0.3.1 workflow that set the old Options→Sources gets
// the all-sources default now — n8n strips undeclared collection options before
// preSend runs, so the saved value is unreadable here. Wider scope, never zero.
async function resolveSources(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const selected = (this.getNodeParameter('sources', []) as string[]) ?? [];
	const body = (requestOptions.body as Record<string, unknown>) ?? {};
	body.sources = selected.length ? selected : ALL_SOURCES;
	requestOptions.body = body;
	return requestOptions;
}

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
		// Top-level (not buried in "Options") so it appears in the auto-generated
		// AI-tool schema and to humans — the one setting that decides whether
		// search returns anything shouldn't be optional-and-hidden.
		displayName: 'Sources',
		name: 'sources',
		type: 'multiOptions',
		default: [],
		options: sourceOptions,
		displayOptions: { show: showOnlyForSearch },
		description:
			'Which sources to search. Leave empty to search ALL sources — Vault plus every connected integration (recommended for agents). Select specific sources (e.g. Lightfield, Gmail, Slack) to narrow the scope.',
		routing: {
			send: {
				preSend: [resolveSources],
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
