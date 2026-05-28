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
			displayName: 'Act as User',
			name: 'asUser',
			type: 'string',
			default: '',
			description:
				'User ID to act as (sent as the X-As-User header). An API key alone is scoped to the app and sees no per-user data — set this to the user who connected the integration (e.g. Gmail, Lightfield) to query their documents. Leave empty to query app-level data only. A user-scoped JWT does not need this.',
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
				// Only sent when "Act as User" is set; an empty value resolves to
				// undefined so the header is omitted (the API treats an empty
				// X-As-User as a distinct, dataless identity, not "no user").
				'X-As-User': '={{$credentials.asUser || undefined}}',
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
