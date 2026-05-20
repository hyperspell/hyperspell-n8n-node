import type { INodeProperties } from 'n8n-workflow';
import { sourceOptions } from '../shared';

const showOnlyForDocumentGet = {
	operation: ['get'],
	resource: ['document'],
};

export const documentGetDescription: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		default: 'vault',
		required: true,
		displayOptions: { show: showOnlyForDocumentGet },
		options: sourceOptions,
		description: 'The provider that owns this document. Use Vault for documents added via this node.',
	},
	{
		displayName: 'Resource ID',
		name: 'resourceId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnlyForDocumentGet },
		description: 'The resource ID returned when the document was added',
	},
];
