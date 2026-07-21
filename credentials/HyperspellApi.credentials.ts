import type {
	IAuthenticate,
	Icon,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
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
				"The user ID requests run as, sent as the X-As-User header — the same value used when the user's account was connected (often a Clerk ID like user_2abc... or an email). NOT the display name. Find it where your app created the user: the user_id your app passed to POST /auth/user_token or the Connect flow. Each operation's own Act as User field overrides this. If both are empty, the node defaults to the app's user with the most documents (requests run app-scoped only when no users exist yet).",
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.hyperspell.com',
			description: 'Override the API base URL (only needed for self-hosted Hyperspell deployments).',
		},
	];

	// The FUNCTION form of authenticate, not an IAuthenticateGeneric block, on
	// purpose (ENG-3313): n8n applies credential authentication AFTER the
	// declarative routing + preSend have built the request
	// (httpRequestWithAuthentication → CredentialsHelper.authenticate), and the
	// object-form merge assigns every declared header unconditionally — it would
	// clobber a per-operation X-As-User set by the node's Act as User field
	// (nodes/Hyperspell/resources/actAsUser.ts). The function form receives the
	// built request, so the precedence is: operation field > credential field >
	// no header at all. (The old `={{$credentials.asUser || undefined}}`
	// expression never actually omitted the header either —
	// CredentialsHelper.resolveValue coerces a falsy expression result to '',
	// and the API treats an empty X-As-User as a distinct, dataless identity.)
	authenticate: IAuthenticate = async (
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> => {
		const headers = { ...(requestOptions.headers ?? {}) };
		headers.Authorization = `Bearer ${credentials.apiKey as string}`;
		const requestAsUser =
			typeof headers['X-As-User'] === 'string' ? (headers['X-As-User'] as string).trim() : '';
		const credentialAsUser =
			typeof credentials.asUser === 'string' ? credentials.asUser.trim() : '';
		const asUser = requestAsUser || credentialAsUser;
		if (asUser) {
			headers['X-As-User'] = asUser;
		} else {
			delete headers['X-As-User'];
		}
		requestOptions.headers = headers;
		return requestOptions;
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/memories/status',
			method: 'GET',
		},
	};
}
