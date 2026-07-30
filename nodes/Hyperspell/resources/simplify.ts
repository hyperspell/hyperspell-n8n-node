import type {
	IDataObject,
	IExecuteSingleFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

// Every document-shaped Hyperspell response carries `document`: the FULL hyperdoc
// tree of the parent document, not just the part that matched or the fields you
// asked for. Nothing in the API bounds that field — `max_results` caps how MANY
// documents come back, never how large each one is — so a handful of hits on
// large files runs to megabytes.
//
// That is fine for a workflow that renders a document and fatal for one that
// hands the result to a model. Intent HQ, 2026-07-29: one Answer call →
// ~3.79M tokens → hard 400 from the model before a word was generated. Measured
// on a 50-document TEST app, `Document → List` alone returns 12.9 MB (~3.2M
// tokens) in a single item.
//
// The useful content is already present in compact, BOUNDED form: `highlights[]`
// are the chunks that made a document a hit (the API caps each at 2000 chars)
// and `summary` is their concatenation. Simplified output keeps that and drops
// the tree, which makes response size a function of the result COUNT alone.
//
// Raw output stays one toggle away for callers that want the whole body.

const SIMPLIFY_DESCRIPTION =
	'Whether to return a simplified version of the response instead of the raw data';

type DisplayConditions = NonNullable<INodeProperties['displayOptions']>['show'];

/** Top-level Simplify toggle for one operation's `displayOptions.show` block. */
export function simplifyProperty(show: DisplayConditions): INodeProperties {
	return {
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: { show },
		description: SIMPLIFY_DESCRIPTION,
	};
}

interface Highlight {
	text?: string;
	score?: number;
}

interface HyperspellDocument extends IDataObject {
	summary?: string;
	highlights?: Highlight[];
	document?: IDataObject;
}

// Result-array keys across the document-shaped responses:
//   POST /memories/query → documents;  GET /memories/list → items.
const RESULT_ARRAY_KEYS = ['documents', 'items'];

/** The matched text, preferring the server's concatenation of the highlights. */
function matchedText(document: HyperspellDocument): string {
	if (typeof document.summary === 'string' && document.summary.length > 0) {
		return document.summary;
	}
	const highlights = Array.isArray(document.highlights) ? document.highlights : [];
	return highlights
		.map((highlight) => highlight?.text)
		.filter((text): text is string => typeof text === 'string' && text.length > 0)
		.join('\n\n');
}

function simplifyDocument(document: HyperspellDocument): IDataObject {
	// Explicit allow-list, not a `delete document.document`: `summary` and
	// `highlights[].text` carry the SAME text (summary is defined as their
	// concatenation), so passing both through would ship every matched chunk
	// twice — pure duplicated tokens for whatever reads this next.
	const simplified: IDataObject = {
		resource_id: document.resource_id,
		source: document.source,
		type: document.type,
		title: document.title,
		score: document.score,
		text: matchedText(document),
		collection: document.collection,
		metadata: document.metadata,
		ingested_at: document.ingested_at,
		last_modified_at: document.last_modified_at,
		document_date: document.document_date,
	};
	// List rows carry indexing status and no score; query hits are the reverse.
	// Keep whichever the response actually had rather than inventing nulls.
	if (document.status !== undefined) simplified.status = document.status;
	if (document.score === undefined) delete simplified.score;
	return simplified;
}

/**
 * postReceive: replace each result's full hyperdoc tree with the matched text,
 * unless the caller turned Simplify off. Preserves the envelope and the result
 * array's key and length, so it composes with `hintAppScopedEmpty` (which reads
 * that length) and with auto-pagination (which reads `next_cursor` from the raw
 * body before postReceive runs).
 */
export async function simplifyDocuments(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	// Default true: an author who never finds the toggle gets bounded output,
	// the only shape that survives being handed to a model. The fallback also
	// covers workflows saved before this field existed.
	if (this.getNodeParameter('simplify', true) === false) return items;

	return items.map((item) => {
		const json = (item.json ?? {}) as IDataObject;
		const key = RESULT_ARRAY_KEYS.find((candidate) => Array.isArray(json[candidate]));
		if (key === undefined) return item;
		const documents = json[key] as HyperspellDocument[];
		return { ...item, json: { ...json, [key]: documents.map(simplifyDocument) } };
	});
}
