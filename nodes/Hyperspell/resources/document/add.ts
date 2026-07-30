import {
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INodeProperties,
} from 'n8n-workflow';

/**
 * preSend: parse the Metadata (JSON) field onto the request body, raising a
 * clear node error instead of quietly sending nothing.
 *
 * Only the *shape* is checked here. The key rules (alphanumeric/dash/period,
 * <=64 chars, 50 keys max, reserved names, scalar values) belong to the server
 * — `api/metadata.py validate_metadata` — and duplicating them in the node
 * would just give us two sets of rules to drift apart. What the node owes the
 * user is the one thing the server can't tell them: that their JSON never
 * parsed and the request went out without it.
 */
function describe(value: unknown): string {
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	return typeof value;
}

export async function sendMetadata(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const additionalFields = (this.getNodeParameter('additionalFields', {}) as IDataObject) ?? {};
	const raw = additionalFields.metadata;
	// An untouched field is not metadata the user meant to send.
	if (raw === undefined || raw === null || raw === '' || raw === '{}') return requestOptions;

	let parsed: unknown;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			throw new NodeOperationError(
				this.getNode(),
				`Metadata is not valid JSON: ${(error as Error).message}`,
				{ description: 'Fix the Metadata (JSON) field, e.g. {"department": "engineering"}.' },
			);
		}
	} else {
		// n8n hands back an already-parsed object when the field is fed by an
		// expression rather than typed literally.
		parsed = raw;
	}

	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new NodeOperationError(
			this.getNode(),
			// `typeof null` is 'object', which reads as nonsense in an error message.
			`Metadata must be a JSON object, got ${describe(parsed)}`,
			{ description: 'Use a key/value object, e.g. {"department": "engineering"}.' },
		);
	}

	const body = (requestOptions.body as IDataObject) ?? {};
	body.metadata = parsed as IDataObject;
	requestOptions.body = body;
	return requestOptions;
}

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
						// preSend, not `value: '={{ JSON.parse($value) }}'`. When JSON.parse
						// throws inside an n8n expression the result is undefined, the key
						// is dropped from the body, and the node reports SUCCESS — the
						// document gets indexed with no metadata at all and every metadata
						// filter downstream silently fails to match it. Captured against
						// n8n 2.32.6: `{dept: eng}` produced a 200 with metadata absent and
						// no warning anywhere. Fail loudly instead.
						preSend: [sendMetadata],
					},
				},
			},
		],
	},
];
