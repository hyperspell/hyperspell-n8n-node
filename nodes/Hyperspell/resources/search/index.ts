import type { INodeProperties } from 'n8n-workflow';
import { hintAppScopedEmpty } from '../actAsUser';
import { searchQueryDescription } from './query';

const showOnlyForSearch = {
	resource: ['search'],
};

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
						body: { answer: false },
					},
					// One notice item when the response is empty because no Act as
					// User was set anywhere — app-scoped queries find no user data.
					output: {
						postReceive: [hintAppScopedEmpty],
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
						body: { answer: true },
					},
					output: {
						postReceive: [hintAppScopedEmpty],
					},
				},
			},
		],
		default: 'search',
	},
	...searchQueryDescription,
];
