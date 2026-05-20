import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class HyperspellApi implements ICredentialType {
	name = 'hyperspellApi';

	displayName = 'Hyperspell API';

	icon: Icon = {
		light: 'file:../icons/hyperspell.svg',
		dark: 'file:../icons/hyperspell.dark.svg',
	};

	documentationUrl = 'https://docs.hyperspell.com';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Hyperspell API key. Create one at https://app.hyperspell.com under Settings → API Keys.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.hyperspell.com',
			description: 'Override the API base URL (only needed for self-hosted Hyperspell deployments).',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/memories/status',
			method: 'GET',
		},
	};
}
