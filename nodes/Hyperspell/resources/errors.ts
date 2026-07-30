import {
	NodeApiError,
	type IDataObject,
	type JsonObject,
	type IExecuteSingleFunctions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
} from 'n8n-workflow';

// Hyperspell's 4xx bodies carry a genuinely useful sentence, and n8n was
// throwing all of it away. Two compounding causes in n8n-workflow's
// NodeApiError:
//
//   1. POSSIBLE_ERROR_MESSAGE_KEYS lists `error` BEFORE `message`. Our bodies
//      are {message, error} where `error` is the CODE — so n8n extracted
//      "WrongUser" and discarded the explanation.
//   2. STATUS_CODE_MESSAGES then overwrites even that with its own generic
//      line for the status code.
//
// Net effect, both captured against n8n 2.32.6 on live prod keys:
//
//   pinned key + a different Act as User
//     API : "This API key is scoped to a specific user; X-As-User must match
//            that user or be omitted."
//     user: "Forbidden - perhaps check your credentials?"
//
//   memories:read key calling Document -> Add
//     API : "Missing scopes: ['memories:write']"
//     user: "Forbidden - perhaps check your credentials?"
//
// In both cases the credentials are fine — it's the pinning or the scopes —
// so the message points at exactly the wrong thing.
//
// Fix: `ignoreHttpStatusErrors` on requestDefaults lets 4xx/5xx reach
// postReceive as ordinary responses, and we raise the error ourselves with the
// API's own wording as the message.

interface HyperspellError {
	message?: string;
	error?: string;
	detail?: unknown;
}

/** Pull the human sentence out of a Hyperspell or FastAPI error body. */
function explain(body: unknown): { message: string; code?: string } | undefined {
	if (typeof body === 'string' && body.trim() !== '') return { message: body.slice(0, 500) };
	if (body === null || typeof body !== 'object') return undefined;
	const { message, error, detail } = body as HyperspellError;
	// Hyperspell: {message: "<explanation>", error: "<Code>"}.
	if (typeof message === 'string' && message !== '') {
		return { message, code: typeof error === 'string' ? error : undefined };
	}
	// FastAPI validation / HTTPException: {detail: "<text>"} or {detail: [...]}.
	if (typeof detail === 'string' && detail !== '') return { message: detail };
	if (Array.isArray(detail) && detail.length > 0) {
		const first = detail[0] as IDataObject;
		const msg = typeof first?.msg === 'string' ? first.msg : JSON.stringify(first);
		const loc = Array.isArray(first?.loc) ? ` (at ${(first.loc as unknown[]).join('.')})` : '';
		return { message: `${msg}${loc}` };
	}
	// Some surfaces send only the code.
	if (typeof error === 'string' && error !== '') return { message: error };
	return undefined;
}

/**
 * postReceive: turn a non-2xx response into a NodeApiError carrying the API's
 * own explanation. Registered FIRST on every operation, so nothing downstream
 * has to reason about error bodies.
 *
 * Runs only because `requestDefaults.ignoreHttpStatusErrors` is set — without
 * it n8n throws before postReceive and this never fires.
 */
export async function raiseApiErrors(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const status = response.statusCode;
	if (status < 400) return items;

	const explained = explain(response.body);
	throw new NodeApiError(
		this.getNode(),
		(response.body ?? {}) as JsonObject,
		{
			httpCode: String(status),
			// `message` is what the user reads first. Give them the API's sentence,
			// and fall back to n8n's generic line only when the body says nothing.
			message: explained?.message,
			description: explained?.code ? `Hyperspell error code: ${explained.code}` : undefined,
		},
	);
}
