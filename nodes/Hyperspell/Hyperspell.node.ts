import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { documentDescription } from './resources/document';
import { searchDescription } from './resources/search';

export class Hyperspell implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hyperspell',
		name: 'hyperspell',
		icon: { light: 'file:../../icons/hyperspell.svg', dark: 'file:../../icons/hyperspell.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Add documents to Hyperspell and run semantic search or grounded generation from any workflow',
		defaults: {
			name: 'Hyperspell',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'hyperspellApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: '={{$credentials.baseUrl}}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Document',
						value: 'document',
					},
					{
						name: 'Search',
						value: 'search',
					},
				],
				default: 'document',
			},
			...documentDescription,
			...searchDescription,
		],
	};
}
