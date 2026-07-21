import {
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodeListSearchItems,
	type INodeListSearchResult,
	type INodeProperties,
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

export function defaultedUserEmptyHint(userId: string): string {
	return `No results — Act as User was empty, so this request defaulted to ${userId}, the app's user with the most documents. Set Act as User on the operation or credential to run as someone else.`;
}

const ACT_AS_USER_DESCRIPTION =
	"The user ID this request runs as — the same value used when the user's account was connected (often a Clerk ID like user_2abc... or an email). NOT the display name. Overrides the credential's Act as User. Leave empty to use the credential value; if both are empty, the node defaults to the app's user with the most documents (requests run app-scoped only when no users exist yet).";

/**
 * Read the effective per-operation Act as User value (trimmed), or '' when the
 * field is empty or absent. extractValue unwraps the resourceLocator
 * {mode, value} envelope to the plain string.
 */
function readActAsUser(context: IExecuteSingleFunctions): string {
	const raw = context.getNodeParameter('actAsUser', '', { extractValue: true });
	return typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
}

// Runtime default (ENG-3313 follow-up): when neither the operation field nor
// the credential names a user, act as the app's most-resourced user instead of
// silently running app-scoped. Core orders GET /users by document_count DESC,
// so the first row of the first page IS that user. n8n has no dynamic field
// defaults, which is why this lives in the preSend rather than the property.
// Resolution (including failure — '' when GET /users is unavailable or the app
// has no users) is cached per credential for a minute so multi-item executions
// don't re-fetch per item.
const DEFAULT_USER_CACHE_TTL_MS = 60_000;
const defaultUserCache = new Map<string, { userId: string; expiresAt: number }>();

async function readCredentials(context: IExecuteSingleFunctions): Promise<IDataObject | undefined> {
	try {
		return (await context.getCredentials('hyperspellApi')) as IDataObject;
	} catch {
		return undefined;
	}
}

function credentialAsUserOf(credentials: IDataObject | undefined): string {
	return typeof credentials?.asUser === 'string' ? credentials.asUser.trim() : '';
}

async function resolveDefaultUser(
	context: IExecuteSingleFunctions,
	credentials: IDataObject,
): Promise<string> {
	const cacheKey = `${credentials.baseUrl}|${credentials.apiKey}`;
	const cached = defaultUserCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) return cached.userId;
	let userId = '';
	try {
		const body = (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'hyperspellApi',
			{
				method: 'GET',
				baseURL: credentials.baseUrl as string,
				url: '/users',
				qs: { limit: 1, offset: 0 },
				json: true,
			},
		)) as IDataObject;
		const users = Array.isArray(body?.users) ? (body.users as UsersResponseUser[]) : [];
		userId = (users[0]?.user_id ?? '').trim();
	} catch {
		// GET /users unavailable (core predating ENG-3313) or transient failure —
		// fall back to the old app-scoped behavior rather than failing the run.
	}
	defaultUserCache.set(cacheKey, { userId, expiresAt: Date.now() + DEFAULT_USER_CACHE_TTL_MS });
	return userId;
}

/**
 * preSend: set X-As-User from the operation's Act as User field. When empty,
 * the header is left unset so the credential's authenticate function can fall
 * back to the credential-level value. When BOTH are empty, default to the
 * app's user with the most documents (GET /users row one); only if that can't
 * be resolved does the request run app-scoped like before.
 */
export async function applyActAsUser(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	let asUser = readActAsUser(this);
	if (!asUser) {
		const credentials = await readCredentials(this);
		if (credentials && !credentialAsUserOf(credentials)) {
			asUser = await resolveDefaultUser(this, credentials);
		}
	}
	if (asUser) {
		requestOptions.headers = { ...(requestOptions.headers ?? {}), [AS_USER_HEADER]: asUser };
	}
	return requestOptions;
}

// GET /users response shapes (core endpoint contract, ENG-3313 PR 3):
//   { users: [{ user_id, display_name|null, document_count, last_indexed|null }],
//     total, limit, offset }
interface UsersResponseUser {
	user_id: string;
	display_name: string | null;
}

const USERS_PAGE_SIZE = 50;

export const USERS_ENDPOINT_UNAVAILABLE_HINT =
	"Could not list users — your Hyperspell API version may not support GET /users yet; use the 'By ID' mode instead.";

/**
 * listSearch method backing the "From list" mode: page through GET /users on
 * the app's API key (app-scoped — no X-As-User needed). The endpoint has no
 * search parameter, so the dropdown's filter string is applied client-side
 * against user_id and display_name. The pagination token is the next offset.
 */
export async function getUsers(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const offset = Number(paginationToken ?? 0) || 0;
	const credentials = (await this.getCredentials('hyperspellApi')) as IDataObject;
	let body: IDataObject;
	try {
		body = (await this.helpers.httpRequestWithAuthentication.call(this, 'hyperspellApi', {
			method: 'GET',
			baseURL: credentials.baseUrl as string,
			url: '/users',
			qs: { limit: USERS_PAGE_SIZE, offset },
			json: true,
		})) as IDataObject;
	} catch (error) {
		// Most likely a 404 from a core deployment that predates GET /users; either
		// way, surface a clear pointer at the By ID escape hatch instead of letting
		// the dropdown render as an empty workspace.
		throw new NodeOperationError(this.getNode(), USERS_ENDPOINT_UNAVAILABLE_HINT, {
			description: error instanceof Error ? error.message : undefined,
		});
	}
	const users = Array.isArray(body?.users) ? (body.users as UsersResponseUser[]) : null;
	if (users === null) {
		throw new NodeOperationError(this.getNode(), USERS_ENDPOINT_UNAVAILABLE_HINT, {
			description: 'Unexpected GET /users response shape (no "users" array).',
		});
	}
	const query = (filter ?? '').trim().toLowerCase();
	const results: INodeListSearchItems[] = users
		.filter(
			(user) =>
				!query ||
				user.user_id.toLowerCase().includes(query) ||
				(user.display_name ?? '').toLowerCase().includes(query),
		)
		.map((user) => ({
			name: user.display_name ? `${user.display_name} (${user.user_id})` : user.user_id,
			value: user.user_id,
		}));
	// Advance by the RAW page size, not the filtered count — filtering is
	// client-side, so the next offset must track what the API actually returned.
	const nextOffset = offset + users.length;
	const total = typeof body.total === 'number' ? body.total : nextOffset;
	return {
		results,
		paginationToken: users.length > 0 && nextOffset < total ? String(nextOffset) : undefined,
	};
}

/**
 * The per-operation "Act as User" override field for one resource: a
 * resourceLocator with a searchable "From list" dropdown (backed by the core
 * GET /users endpoint via the getUsers listSearch method) plus the original
 * "By ID" mode, which stays the default so expressions/AI-agent values and
 * saved workflows keep working unchanged.
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
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'getUsers',
					searchable: true,
				},
			},
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
 * postReceive: when a user-scoped operation comes back empty AND no explicit
 * Act as User was set (operation field empty and credential field empty), the
 * request either defaulted to the app's most-documented user (see
 * resolveDefaultUser) or — if that user couldn't be resolved — silently ran
 * app-scoped, the exact failure a customer hit (empty results with no
 * explanation). Append ONE notice item saying which of the two happened.
 * Existing data is never removed, and any run with results (or with an
 * explicit user, where empty is a real answer) passes through untouched.
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
	const credentials = await readCredentials(this);
	if (credentialAsUserOf(credentials)) return items;
	// Mirror the preSend's decision: if credentials were unreadable there too,
	// no default was applied and the run was app-scoped — a spurious hint on an
	// empty result beats silent app-scoped confusion. Cache makes the re-check
	// free in the common case.
	const defaultedUser = credentials ? await resolveDefaultUser(this, credentials) : '';
	const notice = defaultedUser ? defaultedUserEmptyHint(defaultedUser) : APP_SCOPED_EMPTY_HINT;
	return [...items, { json: { notice } }];
}
