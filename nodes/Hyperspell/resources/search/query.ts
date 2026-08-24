import type {
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';
import { sourceOptions } from '../shared';
import { simplifyProperty } from '../simplify';

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
	// Top-level, like Sources: the raw shape breaks the node's single most common
	// downstream use (hand the result to a model), so the escape hatch has to be
	// visible rather than buried under "Add Option".
	simplifyProperty(showOnlyForSearch),
	{
		// Top-level, like Sources and Simplify: effort is the single biggest lever on
		// whether a broad question gets answered at all, and burying it under "Add
		// Option" meant almost every workflow silently ran at the API's `minimal`
		// default — n8n strips undeclared collection options, so an untouched node
		// never sent the key. Measured on a production tenant: at the old default the
		// widest questions returned nothing; at `very_high` the same questions, same
		// data, same permissions, answered.
		//
		// Default is `very_high` deliberately. The dial trades latency for whether
		// there IS an answer, and an agent asking "what is the team working on"
		// wants the answer. Lower it when speed matters more.
		displayName: 'Effort',
		name: 'effort',
		type: 'options',
		default: 'very_high',
		displayOptions: { show: showOnlyForSearch },
		// Ordered best-answer -> fastest, not alphabetically: this is a quality/speed
		// dial and the recommended default must read first. Alphabetising would put
		// 'Very High (Recommended)' last, under 'Minimal'.
		// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
		options: [
			{
				name: 'Very High (Recommended)',
				value: 'very_high',
				description:
					'Researches like an agent — follows leads across sources. Best answers, slowest (typically 30-90s).',
			},
			{
				name: 'High',
				value: 'high',
				description: 'Rewrites the query, then refines over several retrieval rounds',
			},
			{
				name: 'Medium',
				value: 'medium',
				description: 'Rewrites the query, then refines over a few retrieval rounds',
			},
			{
				name: 'Low',
				value: 'low',
				description: 'Rewrites the query and extracts dates, then retrieves once',
			},
			{
				name: 'Minimal',
				value: 'minimal',
				description:
					'Uses your words verbatim, one pass. Fastest, and may not answer broad questions.',
			},
		],
		description:
			'How hard to work on the answer. Higher finds more and answers more questions, but takes longer. Lower is faster.',
		routing: {
			send: {
				type: 'body',
				property: 'effort',
			},
		},
	},
	{
		// Top-level for the same reason as Sources and Effort: n8n strips undeclared
		// collection options before preSend, so an untouched node never sends the key
		// and silently gets the API default of 10. On a broad question spanning every
		// connected source, 10 documents is a thin evidence base — and the dial that
		// fixes it was invisible behind "Add Option".
		displayName: 'Max Results',
		name: 'maxResults',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 1, maxValue: 200 },
		displayOptions: { show: showOnlyForSearch },
		description: 'How many documents to retrieve. Raise it for broad questions that span several sources; lower it to keep responses small.',
		routing: {
			send: {
				type: 'body',
				property: 'max_results',
			},
		},
	},
];
