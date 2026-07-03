# Incident — Live resource silently returns empty/wrong data (Hyperdoc envelope migration, 2026-06-11)

**Author:** David Szarzynski (theory 2026-07-03) + investigation.
**Status:** Root cause confirmed against live prod (2026-07-03). Fix in this PR. Not yet reproduced against the *specific* client workflow.
**Severity:** Client-facing data loss — silent (HTTP 200, no error thrown).
**Component:** `n8n-nodes-hyperspell` → the **Live** resource (Search / Get Resource / List Resources).
**Root-cause locus:** Hyperspell backend `/live/*` response-shape migration (ENG-2478 / ENG-2479), **not** node logic.

---

## TL;DR

The Live resource shipped **2026-06-11** (`258c6dd`, released in 0.3.0) built against the *pre-migration* flat resource JSON. **The same day**, the backend flipped `/live/*` responses to the new **`DocumentResponse` (Hyperdoc)** envelope (`39e87d556`, ENG-2479). Calls still return `200` and pagination still works, but each item's **body moved into a nested `document` hyperdoc tree** and several envelope fields were renamed/added. The node uses pure declarative routing with **no output post-processing**, so it hands the raw envelope straight to downstream nodes. Any client expression reading the old flat fields now resolves to `undefined` — the workflow runs green and produces empty/partial output.

---

## Timeline (2026, America/Los_Angeles)

| Date | Repo | Event |
|---|---|---|
| Jun 11 ~20:35 | node | `258c6dd` — "Add Live resource (#6)". Live ops ship: List Sources, Search, Get Resource, List Resources. |
| Jun 11 | node | `d90f1fc` — Release **0.3.0** (carries the Live resource). |
| Jun 11 | backend | `2534e286d` — ENG-2478 "Flip indexing-pipeline writes to documents + Hyperdoc (Phase 3)". |
| Jun 11 | backend | `39e87d556` — ENG-2479 "Document-shaped API responses + `<Hyperdoc />` renderer (Phase 4)". **Creates `DocumentResponse`.** |

The node feature and the backend response-shape flip landed within hours of each other, same release window. The node was validated against the shape that existed when it was written; the shape changed underneath it that evening.

---

## Confirmed evidence

### Backend returns the Hyperdoc envelope (current code, `apps/core/hyperspell_core/api/`)
- `GET /live/{source}/resources` → `CursorPage[DocumentResponse]` = `{ items: [DocumentResponse…], next_cursor }` (`live.py:120`).
- `GET /live/{source}/resources/{id}` and `POST /live/{source}/search` → `LiveResourceResponse` = `{ documents: [DocumentResponse…], indexed, notes }` (`live.py:61`).
- `DocumentResponse` (`schemas.py:75`) fields: `resource_id, source, type, title, status, collection, metadata, ingested_at, last_modified_at, document_date, document`. The body lives in **`document`** — a recursive hyperdoc tree you switch on `type` and recurse `children`. `git log` confirms this block first appears in `39e87d556` (ENG-2479, Jun 11).
- Responses use `response_model_exclude_none=True`, so **null fields are dropped** — the item shape *varies per row*.

### Live reproduction against prod — app 994, 2026-07-03
`GET /live/hubspot/resources?size=2` → `200`:

```json
{
  "items": [
    {
      "resource_id": "contact:479239644873",
      "source": "hubspot",
      "type": "person",
      "title": "Maria Johnson",
      "status": "pending",
      "metadata": {},
      "last_modified_at": "2026-04-30T03:42:51Z",
      "document_date": "2026-04-29T20:25:46Z",
      "document": {
        "type": "person",
        "id": "73b33537684c",
        "children": [],
        "name": "Maria Johnson",
        "email": "emailmaria@hubspot.com",
        "company": "HubSpot"
      }
    }
  ],
  "next_cursor": "…"
}
```

`GET /live/google_mail/resources` returned an item with **no** `next_cursor` / `last_modified_at` / `document_date` (dropped as null) — demonstrating the per-item shape variance.

### Why it's silent, not an error
- HTTP stays `200`; JSON is valid.
- `next_cursor` pagination key survived the migration, so the node's List pagination doesn't throw.
- Therefore the failure surfaces as **empty/wrong field values in the client's downstream nodes**, with no error to point at.

---

## The break, precisely

1. **Content moved to `document`.** Any old expression like `{{ $json.name }}` / `{{ $json.content }}` now reads `undefined`; the value lives at `{{ $json.document.name }}`.
2. **List/Search/Get wrap the array.** List returns `{items, next_cursor}`; Search/Get return `{documents, …}`. The node emitted the raw wrapper as a **single** n8n item, so a workflow expecting per-resource items reads nothing useful.
3. **Renamed/added envelope fields** (`type`, `collection`, `ingested_at`, `last_modified_at`, `document_date`) + `exclude_none` variance broke anything keyed on the old field names.

---

## Fix (this PR)

Node-side adaptation — the client is on the deployed backend, so the node meets the new contract:

- **Unwrap the collection into per-document n8n items** via typed `postReceive` functions (`live/output.ts`): `items` for List Resources, `documents` for Search / Get Resource. A bare `rootProperty` would drop the envelope siblings, so the functions **merge them onto each emitted item**: `indexed`/`notes` for Search/Get (the Index Results help text points users at `notes`), `next_cursor` for List (manual paging pairs with the new **Cursor** input). A no-document response that carries `notes` emits one envelope item instead of silently outputting nothing; a missing/absent array emits zero items (never `{json: undefined}`, unlike n8n's own `rootProperty` on a missing key). Pagination is unaffected (verified in n8n-core 1.122.25 source: the paginator reads `$response.body.next_cursor` from the raw body before postReceive runs).
- **Point users at the new shape** in the operation/field descriptions: the body lives under `document` (hyperdoc tree); envelope fields are `resource_id/source/type/title/status/metadata/…/document`.

This is an output-shape change → warrants a **0.4.0** release and a client upgrade.

## Still open / follow-ups

1. **Reproduce against the client's actual workflow** (or their post-Jun-11 execution log) to confirm this is the specific break they hit and that the new per-item shape maps cleanly to their downstream nodes.
2. **Contract test / fixture** — partially closed: `tests/live-output.test.mjs` (Node's built-in runner, zero new deps, CI-wired, publish pipeline untouched) pins the unwrap behavior against a real-shape prod fixture, including the missing-key and empty-with-notes edges. Still open: a fixture pinning the *full* `/live/*` response schema so an unrelated backend field rename fails CI too.
3. **Hyperdoc body flattening**: the unwrap restores field access for flat hyperdoc types (`person`, etc.); `message`/`document` types whose body sits in `document.children[]` still require a Code node to read. A flattened `text` convenience field derived from the tree is the natural next step.
4. **Sibling output-contract consistency**: Document List consumes the same `CursorPage {items, next_cursor}` envelope and Search the same `{documents, …}` shape, but neither unwraps — two output contracts now exist for the same shapes. Align (or document the divergence) in a follow-up.
5. **Backend: version the `/live/*` public schema** (or a `?shape=` compat mode). The deeper lesson: an *internal* migration (Hyperdoc) silently changed a *public* response contract for an external consumer. File as a Hyperspell (core) issue — that's the durable, long-lasting fix; the node patch is the immediate relief.

---

*Investigation: git archaeology across `n8n-nodes-hyperspell` + `hyperspell`, plus a live prod reproduction (app 994) on 2026-07-03. Backend `39e87d556` (ENG-2479) is the pivot; node `d90f1fc` (0.3.0) is the exposed consumer.*
