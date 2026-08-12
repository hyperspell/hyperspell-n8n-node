import type { INodeProperties } from 'n8n-workflow';
import { raiseApiErrors } from '../errors';
import { hintAppScopedEmpty } from '../actAsUser';
import { simplifyDocuments, simplifyOne } from '../simplify';
import { documentAddDescription } from './add';
import { documentGetDescription } from './get';
import { documentListDescription } from './list';
import { documentDeleteDescription } from './delete';

const showOnlyForDocument = {
	resource: ['document'],
};

export const documentDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: showOnlyForDocument,
		},
		options: [
			{
				name: 'Add',
				value: 'add',
				action: 'Add a document to the index',
				description: 'Index a document so it becomes searchable',
				routing: {
					request: {
						method: 'POST',
						url: '/memories/add',
					},
					// ignoreHttpStatusErrors is on globally, so EVERY operation needs this —
					// without it a 4xx would flow through as if it were a result.
					output: {
						postReceive: [raiseApiErrors],
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a document by resource ID',
				description: 'Retrieve a single document and its metadata',
				routing: {
					request: {
						method: 'GET',
						url: '=/memories/get/{{$parameter.source}}/{{$parameter.resourceId}}',
					},
					// ignoreHttpStatusErrors is on globally, so EVERY operation needs this —
					// without it a 4xx would flow through as if it were a result.
					// Then bound the body: a get returns one full hyperdoc tree, which
					// is the single largest per-item payload the node can emit.
					output: {
						postReceive: [raiseApiErrors, simplifyOne],
					},
				},
			},
			{
				name: 'List',
				value: 'list',
				action: 'List documents in the index',
				description: 'Paginate through indexed documents with optional filters',
				routing: {
					request: {
						method: 'GET',
						url: '/memories/list',
					},
					// Simplify first (drops each row's full hyperdoc tree), then the
					// notice item when the list is empty because no Act as User was
					// set anywhere — app-scoped lists skip user-scoped documents.
					output: {
						postReceive: [raiseApiErrors, simplifyDocuments, hintAppScopedEmpty],
					},
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a document from the index',
				description: 'Remove a document and its associated chunks',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/memories/delete/{{$parameter.source}}/{{$parameter.resourceId}}',
					},
					// ignoreHttpStatusErrors is on globally, so EVERY operation needs this —
					// without it a 4xx would flow through as if it were a result.
					output: {
						postReceive: [raiseApiErrors],
					},
				},
			},
		],
		default: 'add',
	},
	...documentAddDescription,
	...documentGetDescription,
	...documentListDescription,
	...documentDeleteDescription,
];
