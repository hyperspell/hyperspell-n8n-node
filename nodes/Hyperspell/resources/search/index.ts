import type { INodeProperties } from 'n8n-workflow';
import { searchQueryDescription } from './query';
import { sourceOptions } from '../shared';

const showOnlyForSearch = {
	resource: ['search'],
};

// The API defaults an omitted `sources` to Vault ONLY. Apps whose data lives in
// connected integrations (and have an empty Vault) then get zero results from
// every search — invisible when the node runs as an AI-agent tool, since agents
// rarely fill the optional Sources collection. Send the full source list as the
// body default instead; an explicit Sources selection overrides it.
const allSources = sourceOptions.map((o) => o.value);

export const searchDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showOnlyForSearch },
		options: [
			{
				name: 'Search',
				value: 'search',
				action: 'Search the index',
				description: 'Retrieve chunks ranked by semantic + lexical relevance',
				routing: {
					request: {
						method: 'POST',
						url: '/memories/query',
						body: { answer: false, sources: allSources },
					},
				},
			},
			{
				name: 'Answer',
				value: 'answer',
				action: 'Generate an answer grounded in the index',
				description: 'Run a query and get a grounded answer with cited source documents',
				routing: {
					request: {
						method: 'POST',
						url: '/memories/query',
						body: { answer: true, sources: allSources },
					},
				},
			},
		],
		default: 'search',
	},
	...searchQueryDescription,
];
