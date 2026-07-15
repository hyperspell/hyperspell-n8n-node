import type {
	IDataObject,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

// Per-operation "Act as User" override (ENG-3313).
//
// The Hyperspell API scopes requests by user via the X-As-User header. Without
// it, requests are APP-scoped: List returns every app document, Search/Answer
// find nothing user-scoped, and Live operations 401 (UserTokenRequired).
//
// Merge-order ground truth (n8n-core): credential authentication runs AFTER
// declarative routing and preSend have built the request
// (RoutingNode.rawRoutingRequest → httpRequestWithAuthentication →
// CredentialsHelper.authenticate). The object-form IAuthenticateGeneric merge
// assigns every declared header unconditionally (`requestOptions[outerKey][key]
// = value`), so it would clobber anything set here. That is why the
// HyperspellApi credential uses the FUNCTION form of `authenticate`, which
// yields to an X-As-User header already set by this preSend. Keep the two in
// sync — see credentials/HyperspellApi.credentials.ts.

export const AS_USER_HEADER = 'X-As-User';

export const APP_SCOPED_EMPTY_HINT =
	"No results — this request ran app-scoped because Act as User is empty. Set it on the operation or credential to query a specific user's data.";

const ACT_AS_USER_DESCRIPTION =
	"The user ID this request runs as — the same value used when the user's account was connected (often a Clerk ID like user_2abc... or an email). NOT the display name. Overrides the credential's Act as User. Leave empty to use the credential value; if both are empty, requests are app-scoped and user-scoped data will not be returned.";

/**
 * Read the effective per-operation Act as User value (trimmed), or '' when the
 * field is empty or absent. extractValue unwraps the resourceLocator
 * {mode, value} envelope to the plain string.
 */
function readActAsUser(context: IExecuteSingleFunctions): string {
	const raw = context.getNodeParameter('actAsUser', '', { extractValue: true });
	return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
}

/**
 * preSend: set X-As-User from the operation's Act as User field. When empty,
 * the header is left unset so the credential's authenticate function can fall
 * back to the credential-level value (or omit the header entirely).
 */
export async function applyActAsUser(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const asUser = readActAsUser(this);
	if (asUser) {
		requestOptions.headers = { ...(requestOptions.headers ?? {}), [AS_USER_HEADER]: asUser };
	}
	return requestOptions;
}

/**
 * The per-operation "Act as User" override field for one resource. A
 * resourceLocator with a single "By ID" mode on purpose: a future release adds
 * a "From list" dropdown backed by a core user-listing endpoint, and shipping
 * the resourceLocator shape now avoids a breaking field migration later.
 */
export function actAsUserProperty(resource: string): INodeProperties {
	return {
		displayName: 'Act as User',
		name: 'actAsUser',
		type: 'resourceLocator',
		default: { mode: 'id', value: '' },
		displayOptions: { show: { resource: [resource] } },
		modes: [
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. user_2abc123 or jane@acme.com',
			},
		],
		description: ACT_AS_USER_DESCRIPTION,
		routing: { send: { preSend: [applyActAsUser] } },
	};
}

// Result-carrying envelope keys, per operation response shape:
//   /memories/query → documents;  /memories/list → items;
//   /live/.../resources (after unwrapCursorPage: an empty page is zero items);
//   /live/{src}/search & get (after unwrapLiveEnvelope: an empty fetch is zero
//   items or one {documents: [], notes} envelope item);  /live/sources → sources.
// An item with none of these keys IS a result row (an unwrapped live document,
// a listed source), so it counts as data.
const RESULT_ARRAY_KEYS = ['documents', 'items', 'sources'];

function itemsCarryResults(items: INodeExecutionData[]): boolean {
	if (items.length === 0) return false;
	for (const item of items) {
		const json = (item.json ?? {}) as IDataObject;
		let sawEnvelopeKey = false;
		for (const key of RESULT_ARRAY_KEYS) {
			const value = json[key];
			if (Array.isArray(value)) {
				sawEnvelopeKey = true;
				if (value.length > 0) return true;
			}
		}
		if (!sawEnvelopeKey) return true;
	}
	return false;
}

/**
 * postReceive: when a user-scoped operation comes back empty AND no effective
 * Act as User was set (operation field empty and credential field empty), the
 * request silently ran app-scoped — the exact failure a customer hit (empty
 * results with no explanation). Append ONE notice item that says so. Existing
 * data is never removed, and any run with results (or with an effective user,
 * where empty is a real answer) passes through untouched.
 */
export async function hintAppScopedEmpty(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	// The response body is not consulted — emptiness is judged on the final
	// (possibly already-unwrapped) items, so this works uniformly after
	// unwrapLiveEnvelope/unwrapCursorPage and on raw single-item bodies.
): Promise<INodeExecutionData[]> {
	if (itemsCarryResults(items)) return items;
	if (readActAsUser(this)) return items;
	let credentialAsUser = '';
	try {
		const credentials = (await this.getCredentials('hyperspellApi')) as IDataObject;
		credentialAsUser = typeof credentials.asUser === 'string' ? credentials.asUser.trim() : '';
	} catch {
		// Credentials unreadable in this context — assume app-scoped and hint; a
		// spurious hint on an empty result beats silent app-scoped confusion.
	}
	if (credentialAsUser) return items;
	return [...items, { json: { notice: APP_SCOPED_EMPTY_HINT } }];
}
