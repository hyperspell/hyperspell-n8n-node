import type { INodeProperties } from 'n8n-workflow';

const showOnlyForDocumentAdd = {
	operation: ['add'],
	resource: ['document'],
};

export const documentAddDescription: INodeProperties[] = [
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForDocumentAdd },
		description: 'Full text of the document to index',
		routing: {
			send: {
				type: 'body',
				property: 'text',
			},
		},
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		default: '',
		displayOptions: { show: showOnlyForDocumentAdd },
		description: 'Optional title for the document',
		routing: {
			send: {
				type: 'body',
				property: 'title',
			},
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnlyForDocumentAdd },
		options: [
			{
				displayName: 'Resource ID',
				name: 'resourceId',
				type: 'string',
				default: '',
				description:
					'Stable identifier for upsert. If set and the document exists, it is updated; if omitted, a new ID is generated.',
				routing: {
					send: {
						type: 'body',
						property: 'resource_id',
					},
				},
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'dateTime',
				default: '',
				description:
					'Document date (creation or last-update). Used by ranking and date-range filters.',
				routing: {
					send: {
						type: 'body',
						property: 'date',
					},
				},
			},
			{
				displayName: 'Metadata (JSON)',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description:
					'Custom metadata for filtering. Keys must be alphanumeric/underscores (≤64 chars); values string, number, boolean, or null.',
				routing: {
					send: {
						type: 'body',
						property: 'metadata',
						value: '={{ JSON.parse($value) }}',
					},
				},
			},
		],
	},
];
