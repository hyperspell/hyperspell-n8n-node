# n8n-nodes-hyperspell

An [n8n](https://n8n.io/) community node for [Hyperspell](https://hyperspell.com) — add documents, run semantic search, generate grounded answers, and query connected sources live from any workflow.

Hyperspell is the memory layer for your business: it unifies everything a company knows — across Slack, email, drive, CRM, and more — and makes it instantly queryable by people and AI agents.

## Installation

Follow the [n8n community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

In short, in your n8n instance: **Settings → Community Nodes → Install** and enter `n8n-nodes-hyperspell`.

## Credentials

You'll need a Hyperspell API key. Create one at [app.hyperspell.com](https://app.hyperspell.com) under **Settings → API Keys**.

The credential takes three fields:
- **API Key** — your Hyperspell API key (sent as `Authorization: Bearer …`)
- **Act as User** — optional default user ID (sent as `X-As-User`). See [Act as User](#act-as-user) below.
- **Base URL** — defaults to `https://api.hyperspell.com`. Override only for self-hosted Hyperspell deployments.

## Act as User

Hyperspell scopes every request to a user via the `X-As-User` header. The value is **the user ID your app used when the user's account was connected** — whatever `user_id` you passed to `POST /auth/user_token` or the Connect flow. That's often a Clerk ID like `user_2abc…`, sometimes an email. It is **not** the person's display name.

You can set it in two places:

- **On the credential** — the default for every request made with that credential.
- **On the operation** — every Document, Search, and Live operation has its own **Act as User** field. When set, it overrides the credential value for that request. The field accepts expressions, so an AI agent or a loop can set it per item (e.g. `{{ $json.userId }}`).

What the scope means in practice:

| Effective Act as User | Behavior |
|---|---|
| Set (operation or credential) | Requests run **user-scoped**: Search/Answer and List see that user's documents and connected sources; Live operations use their connections. |
| Empty in both places | Requests run **app-scoped**: List Documents returns every app-level document (no user data), Search/Answer find nothing from user-connected sources, and Live operations fail with `401 UserTokenRequired`. |

Because the app-scoped fallback is silent, user-scoped operations that come back empty while Act as User is empty everywhere emit one extra notice item explaining that the request ran app-scoped and where to set the value.

## Operations

The node exposes three resources with the following operations:

### Document

| Operation | Description |
|---|---|
| **Add** | Index a document. Supply `text`, optional `title`, `resourceId` (upsert key), `date`, and `metadata`. |
| **Get** | Retrieve a single document by `source` + `resourceId`. |
| **List** | Paginate through indexed documents. Supports filters by source, status, and metadata (MongoDB-style). |
| **Delete** | Remove a document and its chunks. |

### Search

| Operation | Description |
|---|---|
| **Search** | Return the top-ranked chunks for a query (semantic + lexical). |
| **Answer** | Same query, but Hyperspell also generates a grounded answer with citations. |

### Live

Query a user's connected sources (Slack, Notion, HubSpot, …) directly — useful for data that isn't indexed yet. Live operations act on a specific user's connections, so set **Act as User** on the operation or the credential (see [Act as User](#act-as-user)).

**Output shape:** Search and Get Resource emit **one item per document**, with the response envelope's `indexed` and `notes` fields merged onto each item. List Resources emits **one item per resource** with `next_cursor` on each — feed it back via the **Cursor** field to page manually when **Return All** is off (`null` means last page). Document content lives under each item's nested `document` tree.

| Operation | Description |
|---|---|
| **List Sources** | List the user's connected sources and the live capabilities each supports. |
| **Search** | Search a connected source live (where the source supports it). |
| **Get Resource** | Fetch a single resource live by ID, optionally queueing it for indexing. |
| **List Resources** | Paginate through a source's resources live (cursor-based). |

## Use as an AI Agent tool

This node sets `usableAsTool: true`, so n8n's **Tools Agent** can invoke any operation directly. Connect the Hyperspell node as a Tool input on an Agent node and the LLM will call `Search` / `Answer` whenever it needs grounded context.

## Example workflow

A common pattern:

1. **Trigger** (Schedule, Webhook, anything) →
2. **HTTP Request / Slack / Gmail** to fetch content →
3. **Hyperspell — Document → Add** to index it →
4. Later: **Hyperspell — Search → Answer** to query the index from chat / another workflow.

## Development

To hack on this node locally, see [CONTRIBUTING.md](./CONTRIBUTING.md) — it covers the two install paths (`npm run dev` hot-reload vs `npm pack` tarball install), how to mint a local Hyperspell API key, and the per-operation curl recipes for debugging routing.

## Resources

- [Hyperspell docs](https://docs.hyperspell.com)
- [Hyperspell GitHub](https://github.com/hyperspell)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](./LICENSE.md)
