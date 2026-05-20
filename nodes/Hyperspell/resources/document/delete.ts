import type { INodeProperties } from 'n8n-workflow';
import { sourceOptions } from '../shared';

const showOnlyForDocumentDelete = {
	operation: ['delete'],
	resource: ['document'],
};

export const documentDeleteDescription: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		default: 'vault',
		required: true,
		displayOptions: { show: showOnlyForDocumentDelete },
		options: sourceOptions,
		description: 'The provider that owns this document. Use Vault for documents added via this node.',
	},
	{
		displayName: 'Resource ID',
		name: 'resourceId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnlyForDocumentDelete },
		description: 'The resource ID of the document to delete',
	},
];
