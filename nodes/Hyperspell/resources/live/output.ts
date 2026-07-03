import type {
	IDataObject,
	IExecuteSingleFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
} from 'n8n-workflow';

// The /live/* endpoints wrap results in envelopes (ENG-2479 Hyperdoc migration):
//   Search / Get Resource → LiveResourceResponse { documents, indexed, notes }
//   List Resources        → CursorPage           { items, next_cursor }
// A bare `rootProperty` postReceive would emit the array elements but silently
// drop the envelope siblings — `notes` (which the Index Results field help
// points users at), `indexed`, and `next_cursor` (the only handle for manual
// paging). So we unwrap by hand and merge the envelope onto each emitted item.
// The document/resource fields win nothing here: the backend DocumentResponse
// has no `indexed`/`notes`/`next_cursor` keys, so the spreads cannot collide.
// See docs/incidents/2026-06-11-live-resource-hyperdoc-shape.md.

interface LiveEnvelope {
	documents?: IDataObject[];
	indexed?: boolean;
	notes?: string[];
}

interface CursorPageEnvelope {
	items?: IDataObject[];
	next_cursor?: string | null;
}

export async function unwrapLiveEnvelope(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const body = (response.body ?? {}) as LiveEnvelope;
	const documents = Array.isArray(body.documents) ? body.documents : [];
	const indexed = body.indexed ?? false;
	const notes = Array.isArray(body.notes) ? body.notes : [];
	if (documents.length === 0) {
		// No documents — but the envelope may still explain why (e.g. "indexing
		// skipped: fetch returned no resources"). Emit one envelope item rather
		// than silently outputting nothing; silent-empty is the exact failure
		// mode this resource was patched for. A plain no-hit response (no notes)
		// stays zero-item so IF-node emptiness checks keep working.
		return notes.length > 0 ? [{ json: { documents: [], indexed, notes } }] : [];
	}
	return documents.map((document) => ({ json: { ...document, indexed, notes } }));
}

export async function unwrapCursorPage(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const body = (response.body ?? {}) as CursorPageEnvelope;
	const pageItems = Array.isArray(body.items) ? body.items : [];
	// next_cursor rides on every emitted item so Return All = false users can
	// page manually (pair with the Cursor input field); null means last page.
	// Auto-pagination is unaffected — it reads next_cursor from the raw body
	// before postReceive runs.
	const nextCursor = body.next_cursor ?? null;
	return pageItems.map((item) => ({ json: { ...item, next_cursor: nextCursor } }));
}
