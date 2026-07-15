import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { documentDescription } from './resources/document';
import { searchDescription } from './resources/search';
import { liveDescription } from './resources/live';
import { actAsUserProperty, getUsers } from './resources/actAsUser';

export class Hyperspell implements INodeType {
	// Backs the Act as User "From list" dropdown (ENG-3313): pages through the
	// core GET /users endpoint on the credential's API key.
	methods = {
		listSearch: { getUsers },
	};

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
						name: 'Live',
						value: 'live',
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
			...liveDescription,
			// Per-operation Act as User override, on every operation of every
			// resource (ENG-3313). Declared last so it renders at the bottom of
			// each operation's form.
			actAsUserProperty('document'),
			actAsUserProperty('search'),
			actAsUserProperty('live'),
		],
	};
}
