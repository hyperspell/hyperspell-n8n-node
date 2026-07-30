# n8n node request-contract audit — 2026-07-29/30

Started from one customer report (Intent HQ: a single search returned ~3.79M
tokens and their model 400'd) and turned into an audit of what the node
*actually sends and returns*, against a real n8n and the live API.

**Why so much was hiding here:** the node's tests only exercised `postReceive`
functions in isolation. Nothing asserted the request n8n's routing engine
builds. Every finding below except F1 was invisible to the test suite, to lint,
and to a code review — they only appear when you look at the bytes on the wire.

## The harness

`scripts/echo-capture.mjs` — an HTTP server that logs method, path, query,
headers and body for every request and returns plausible responses so the
routing engine's pagination and postReceive steps still run. Point a
credential's **Base URL** at it, run a workflow, read `captured.jsonl`.

```bash
node scripts/echo-capture.mjs           # listens on :5999
# then set a Hyperspell credential's Base URL to http://localhost:5999
```

Verified against **n8n 2.32.6**, node built from `david/bound-response-size`.

---

## Findings

Severity is about what a user experiences, not how hard it was to fix.

### F1 — Responses are unbounded 🔴 fixed

Every document-shaped response carries `document`, the full hyperdoc tree of
the parent document. `max_results` caps how *many* documents return, never how
*large* each is. Measured on prod against a 50-document test app:

| call | payload |
|---|---|
| `Document → List`, one page | **12.9 MB (~3.2M tokens)** in one n8n item |
| `Answer`, 5 hits | 20.8 KB |

The same text ships up to three times over — `document`, `highlights[].text`
and `summary`.

**Fix:** `Simplify` (top-level, default on) for Search, Answer and Document
List. Keeps the matched text, drops the tree; response size becomes a function
of result *count* alone. `Answer` 20.8 KB → 9.4 KB; `Document List` 12.9 MB →
2.2 KB.

### F2 — `Document → List` sent a page-size param the API ignores 🔴 fixed

The node sent `limit`. `/memories/list` takes `CursorParams` (`size`, default
50, max 100) and FastAPI drops unknown query params **silently**, so the Limit
field never reached the server. Every page fetched 50 whole documents and was
then trimmed client-side — the direct cause of F1's 12.9 MB.

The UI also allowed `maxValue: 250`, a number the server (`le=100`) can never
honour. Live List had this right; only the older Document arm was wrong.

**Fix:** send `size`; cap the field at 100.

### F3 — "Return All" silently discarded every query parameter 🔴 fixed

The worst one. Same node, same filters, one toggle apart:

```
returnAll=false  →  size=7  source=slack  status=failed  filter={"dept":"eng"}
returnAll=true   →  {}
```

n8n's generic pagination merges the paginated request over the base one with a
**shallow spread** (`n8n-core routing-node.js`:
`{...requestData.options, ...paginateRequestData}`), so a pagination block
returning a bare `{ qs: { cursor } }` replaces the entire query object.

Consequences: you ask for failed Slack documents and page through the **whole
app** instead — wrong data, 50 full documents per page, for as many pages as
exist. `Live → List Resources` dropped `connection_id` the same way and
silently queried the **default** connection rather than the one selected.

**Fix:** `PAGED_QS` in `shared.ts` spreads `$request.qs` so only the cursor
advances. Captured after:

```
/memories/list          size=100 source=slack status=failed filter={...}
/live/notion/resources  size=100 connection_id=conn-123
/live/notion/resources  size=100 connection_id=conn-123 cursor=LIVE-CURSOR-2
```

### F4 — Malformed metadata was dropped and reported as success 🟠 fixed

`Metadata (JSON)` routed with `value: '={{ JSON.parse($value) }}'`. When
`JSON.parse` throws inside an n8n expression the result is `undefined`, the key
vanishes from the body, and **the node reports success**. Captured: `{dept: eng}`
→ HTTP 200, `metadata` absent, no warning. The document is indexed with no
metadata and every metadata filter downstream silently fails to match it —
close to undiagnosable from outside.

**Fix:** a `sendMetadata` preSend that raises a node error naming the parse
failure. Shape only — the key/value rules stay server-side in
`api/metadata.py validate_metadata`, so there is one rulebook, not two.

### F5 — Source list had drifted from core 🟠 fixed

Missing `clickup`, `confluence`, `google_meet`, `jira` — all live. Worse than
"can't select them": since 0.3.1 the all-sources default is **built from this
list**, so an empty Sources selection silently skipped them. Also carried
`gmail_actions`, which core does not support, producing an
`IntegrationNotSupported` on every all-sources query.

**Fix:** list refreshed and verified against `DocumentProviders` — all four new
names accepted by prod, zero `IntegrationNotSupported`. `reddit` stays out
deliberately (in the enum, not in the product).

### F6 — API error messages never reach the user 🟠 fixed (0.7.1)

A key pinned to one user (ENG-3417) called with a different Act as User returns:

> This API key is scoped to a specific user; X-As-User must match that user or
> be omitted.

The user sees **"Forbidden - perhaps check your credentials?"** — which points
at exactly the wrong thing.

Two compounding causes in `n8n-workflow/errors/node-api.error.js`:
`POSSIBLE_ERROR_MESSAGE_KEYS` lists `error` **before** `message`, so n8n
extracts Hyperspell's error *code* (`"WrongUser"`) rather than its explanation;
then `STATUS_CODE_MESSAGES['403']` overwrites even that.

Second instance, same cause: a `memories:read` key calling `Document → Add`
gets `Missing scopes: ['memories:write']` from the API and the same
"check your credentials" from n8n.

**Fix:** `ignoreHttpStatusErrors` on `requestDefaults` (it *is* supported —
`IHttpRequestOptions` carries it and `request-helper-functions.js` honours it;
an earlier grep of `routing-node.js` alone missed it) lets 4xx reach
postReceive, and `raiseApiErrors` re-raises with the API's own wording.
Verified against both live 403s:

```
read-only key  -> Document Add : Missing scopes: ['memories:write']
pinned key     -> wrong as-user: This API key is scoped to a specific user; ...
read-only key  -> Search       : succeeds (no false errors)
```

⚠️ `ignoreHttpStatusErrors` is global, so an operation *without*
`raiseApiErrors` would pass a 4xx body through as a result — silently, which is
worse than the bad message. `tests/errors.test.mjs` asserts all 10 operations
run it first.

### F7 — `Live → Search` sent `connection_id: ""` 🟢 fixed

The sibling Live ops omit the field when blank; Search sent an empty string.
Harmless today only because core falsy-checks it (`live_access.py`
`if connection_id:`), but `""` means "no connection" and shouldn't rely on that.

### F8 — `collection` filter is not exposed 🟢 open

`/memories/list` accepts `collection`; the node's Filters collection offers
source, status and metadata only. A gap, not a bug.

---

## Checked and found correct

Worth recording so the next audit doesn't re-litigate them:

- **User-pinned API keys (ENG-3417) work.** The v0.6.0 auto-default resolves
  `GET /users` row one and sends it as `X-As-User`, which *would* be a 403
  against a pinned key. It isn't, because `app_scoped_api_key` rejects
  user-scoped keys, `GET /users` 403s, and `resolveDefaultUser` falls back to
  sending no header — so the key's own identity applies. Correct behaviour, but
  **accidental**: it holds only while `/users` rejects pinned keys. Worth making
  deliberate.
- **Multi-item fan-out.** Three items through one node produced three requests
  with the right per-item body *and* per-item `X-As-User`.
- **The act-as-user cache.** One `GET /users` served ten operations in a run.
- **`Live → List Resources`** already sent `size` correctly.
- **Document List filters** (`source`, `status`, `filter`) match core's
  parameter names exactly — when Return All is off (see F3).

## Still to probe

- No timeout or retry configured anywhere on the node; a high-effort Answer can
  outlive n8n's default
- `Document → Get` and the Live ops still return full hyperdoc trees (bounded by
  explicit user intent, so left alone — but the same bomb if an agent calls them)
- The ~23-entry `errors[]` on an all-sources query: nothing failed, but an agent
  reading its own tool output sees 23 errors. Server-side `notices` split.
