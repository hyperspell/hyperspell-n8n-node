import type { INodeProperties } from 'n8n-workflow';
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
