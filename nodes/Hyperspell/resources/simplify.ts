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

interface HyperdocNode extends IDataObject {
	text?: string;
	children?: HyperdocNode[];
}

interface HyperspellDocument extends IDataObject {
	summary?: string;
	highlights?: Highlight[];
	document?: HyperdocNode;
}

// Result-array keys across the document-shaped responses:
//   POST /memories/query → documents;  GET /memories/list → items;
//   GET /live/{source}/resources → items.
const RESULT_ARRAY_KEYS = ['documents', 'items'];

// Only the QUERY path returns `ScoredDocumentResponse` (schemas.py:152), which
// is the sole model carrying `summary`/`highlights`. `/memories/list`,
// `/memories/get/*` and every `/live/*` route return the plain
// `DocumentResponse` (schemas.py:75) — no summary, no highlights, body only in
// the `document` tree. Simplifying those on the highlights-only path emitted
// `text: ''` and dropped the tree, i.e. deleted the content outright (shipped
// in 0.7.0; Document → List returned metadata-only rows). So the tree is the
// fallback source of text, flattened and capped rather than passed through.
//
// 2000 chars mirrors the API's own per-highlight cap, which keeps a simplified
// row roughly the size of one query hit no matter which endpoint produced it.
// Callers who need the whole body turn Simplify off.
export const MAX_SIMPLIFIED_TEXT = 2000;

/** Depth-first concatenation of a hyperdoc tree's `text` nodes, capped. */
function flattenHyperdoc(node: HyperdocNode | undefined, budget: number): string {
	if (node === undefined || node === null || budget <= 0) return '';
	const parts: string[] = [];
	let remaining = budget;
	const visit = (current: HyperdocNode | undefined): void => {
		if (current === undefined || current === null || remaining <= 0) return;
		if (typeof current.text === 'string' && current.text.length > 0) {
			parts.push(current.text.slice(0, remaining));
			remaining -= Math.min(current.text.length, remaining);
		}
		const children = Array.isArray(current.children) ? current.children : [];
		for (const child of children) visit(child);
	};
	visit(node);
	return parts.join('\n');
}

/**
 * The document's text: the server's highlight concatenation on the query path,
 * otherwise the flattened hyperdoc tree. Never the raw tree, and never empty
 * when the document has any text at all.
 */
function matchedText(document: HyperspellDocument): string {
	if (typeof document.summary === 'string' && document.summary.length > 0) {
		return document.summary;
	}
	const highlights = Array.isArray(document.highlights) ? document.highlights : [];
	const fromHighlights = highlights
		.map((highlight) => highlight?.text)
		.filter((text): text is string => typeof text === 'string' && text.length > 0)
		.join('\n\n');
	if (fromHighlights.length > 0) return fromHighlights;
	return flattenHyperdoc(document.document, MAX_SIMPLIFIED_TEXT);
}

export function simplifyDocument(document: HyperspellDocument): IDataObject {
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

/**
 * postReceive for the single-document responses — `GET /memories/get/*` returns
 * a bare `DocumentResponse`, not an array, so `simplifyDocuments` (which looks
 * for a result-array key) passes it through untouched and the full tree reaches
 * the caller. One document is exactly the case where the tree is largest per
 * item, so this is the operation most worth bounding, not the least.
 */
export async function simplifyOne(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	if (this.getNodeParameter('simplify', true) === false) return items;

	return items.map((item) => {
		const json = (item.json ?? {}) as HyperspellDocument;
		// Only rewrite something that actually looks like a document response;
		// an error body or a notice item must pass through untouched.
		if (json.resource_id === undefined) return item;
		return { ...item, json: simplifyDocument(json) };
	});
}
