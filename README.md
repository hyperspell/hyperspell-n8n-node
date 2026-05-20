# n8n-nodes-hyperspell

An [n8n](https://n8n.io/) community node for [Hyperspell](https://hyperspell.com) — add documents, run semantic search, and generate grounded answers from any workflow.

Hyperspell is a managed RAG platform: drop content in, get back ranked chunks or LLM-generated answers with citations.

## Installation

Follow the [n8n community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

In short, in your n8n instance: **Settings → Community Nodes → Install** and enter `n8n-nodes-hyperspell`.

## Credentials

You'll need a Hyperspell API key. Create one at [app.hyperspell.com](https://app.hyperspell.com) under **Settings → API Keys**.

The credential takes two fields:
- **API Key** — your Hyperspell API key (sent as `Authorization: Bearer …`)
- **Base URL** — defaults to `https://api.hyperspell.com`. Override only for self-hosted Hyperspell deployments.

## Operations

The node exposes two resources with the following operations:

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
