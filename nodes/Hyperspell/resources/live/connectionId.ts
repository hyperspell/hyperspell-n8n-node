import type {
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

// Connection ID is the one Live field an AI Agent gets wrong in a way the API
// cannot recover from.
//
// The node sets `usableAsTool`, so when it runs as an Agent tool the model
// fills the parameters from their descriptions. "Specific connection ID when
// the user has multiple connections for this source" reads, to a model, like
// an invitation to name the source — and that is exactly what happens.
// Observed in prod on 2026-08-10: `connection_id` arriving as 'linear',
// 'github', 'google_drive'.
//
// Core takes that string straight into a UUID-typed column
// (`live_access.py`: `stmt.where(Connection.id == connection_id)`), asyncpg
// rejects it with a DataError, and a blanket `except Exception` in
// `api/live.py` turns it into `502 "Upstream source error."`. That message is
// worse than useless: it blames the provider when no provider was ever
// contacted, so the workflow author reasonably concludes Linear is down.
//
// Core should return a 400 here and will (tracked separately) — but the node
// should not be shipping a malformed request in the first place, and this
// guard keeps working against every already-deployed core version.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * preSend: reject a Connection ID that isn't a UUID, naming the likely mistake.
 *
 * Deliberately NOT a silent drop. Silently ignoring the field would make a
 * request scoped to the wrong connection look like it succeeded — the same
 * class of silent-wrong-answer this node has been bitten by before.
 */
export async function validateConnectionId(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const raw = this.getNodeParameter('connection_id', '') as string | undefined;
	const value = typeof raw === 'string' ? raw.trim() : '';
	if (value === '' || UUID_RE.test(value)) return requestOptions;

	throw new NodeOperationError(
		this.getNode(),
		`Connection ID must be a connection UUID, not "${value}".`,
		{
			description:
				'Connection ID identifies ONE specific connection when a user has connected the same source more than once — it is not the source name. Leave it empty to use the caller\'s connection automatically. If this node is running as an AI Agent tool, pin this field to empty so the model cannot fill it.',
		},
	);
}

/**
 * The Connection ID field, shared by the three document-shaped Live operations.
 *
 * `transport` differs by operation — Search POSTs a body, Get and List Resources
 * put it on the query string — but the validation and the wording must not, so
 * both go through here rather than being restated three times.
 */
export function connectionIdProperty(
	show: NonNullable<INodeProperties['displayOptions']>['show'],
	transport: 'body' | 'query' = 'body',
): INodeProperties {
	return {
		displayName: 'Connection ID',
		name: 'connection_id',
		type: 'string',
		default: '',
		placeholder: '',
		displayOptions: { show },
		// Description is the model's only input when this runs as a tool, so it
		// states the format, and states the default, before it states the purpose.
		description:
			'Leave empty. Optional UUID identifying one specific connection, used only when the same user has connected this source more than once. This is NOT the source name.',
		routing: {
			send: {
				type: transport,
				property: 'connection_id',
				// `|| undefined` so an untouched field is OMITTED rather than sent as
				// "". Core types it `str | None` and only falsy-checks it, so ""
				// happens to be harmless — but the sibling Live ops say "no connection
				// specified" by omission, and this one shouldn't rely on a
				// falsy-string coincidence.
				value: '={{ $value || undefined }}',
				preSend: [validateConnectionId],
			},
		},
	};
}
