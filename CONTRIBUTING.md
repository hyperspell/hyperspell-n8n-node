# Contributing to n8n-nodes-hyperspell

## Prerequisites

- Node.js ≥ 20 (the n8n dev runtime is happiest on Node 22+)
- npm
- A running Hyperspell instance to test against — either [Hyperspell Cloud](https://app.hyperspell.com) or the local Hyperspell stack from the [main monorepo](https://github.com/hyperspell/hyperspell).

## Setup

```bash
git clone git@github.com:hyperspell/hyperspell-n8n-node.git
cd hyperspell-n8n-node
npm install
```

## Two ways to run the node locally

n8n offers two mechanisms for loading non-published nodes during development. Both work, but they have different ergonomics — and different failure modes worth understanding.

### Option A — Hot-reload via `npm run dev` (fastest iteration)

```bash
npm run dev
```

This boots an embedded n8n at <http://localhost:5678> with the node symlinked into n8n's "custom extensions" folder (`~/.n8n-node-cli/.n8n/custom/node_modules/n8n-nodes-hyperspell`). TypeScript changes recompile incrementally and n8n hot-reloads.

**Gotcha:** custom-extension nodes do **not** appear in **Settings → Community Nodes** — that screen lists only npm-installed packages, and the symlink path bypasses npm. The node still works in the node picker (search for "Hyperspell" under the Action tab), but if you specifically need the Community Nodes screen populated, use Option B.

### Option B — Tarball install (production-equivalent)

This mirrors exactly what n8n's **Settings → Community Nodes → Install** does internally. Use it when you need to verify the Community Nodes screen experience, or when Option A is misbehaving and you want to rule out the dev CLI as the cause.

```bash
# 1. Build a tarball
npm run build
npm pack
# produces n8n-nodes-hyperspell-<version>.tgz

# 2. Install into n8n's community-nodes folder
mkdir -p ~/.n8n-node-cli/.n8n/nodes
cd ~/.n8n-node-cli/.n8n/nodes
[ -f package.json ] || echo '{"name":"installed-nodes","private":true,"dependencies":{}}' > package.json
npm install --no-audit --no-fund --omit=dev \
    ~/dev/n8n-nodes-hyperspell/n8n-nodes-hyperspell-<version>.tgz

# 3. Register the package in n8n's DB so the Settings UI sees it
sqlite3 ~/.n8n-node-cli/.n8n/database.sqlite "
INSERT OR REPLACE INTO installed_packages (packageName, installedVersion, authorName, authorEmail)
VALUES ('n8n-nodes-hyperspell', '0.1.0', 'Hyperspell', 'hello@hyperspell.com');
INSERT OR REPLACE INTO installed_nodes (name, type, latestVersion, package)
VALUES ('n8n-nodes-hyperspell.hyperspell', 'n8n-nodes-hyperspell.hyperspell', 1, 'n8n-nodes-hyperspell');
"

# 4. Start n8n pointing at the same user folder
N8N_USER_FOLDER=$HOME/.n8n-node-cli npx -y n8n@latest
```

After this, **Settings → Community Nodes** shows the package, and the node appears in the picker just like a real npm-installed community node.

To pick up code changes, repeat steps 1–2 (rebuild + reinstall the new tarball) and restart n8n.

## Credentials for local testing

The **Hyperspell API** credential takes two fields:

- **API Key** — see [Local API key minting](#local-api-key-minting) below for the local-dev path, or generate one via [app.hyperspell.com](https://app.hyperspell.com)
- **Base URL** — `http://localhost:8000` for the local stack, `https://api.hyperspell.com` for Cloud

The credential **Test** button hits `GET /memories/status` (not `/auth/me`, which only accepts JWTs).

### Local API key minting

The API keys table stores HMACs, not plaintext, so the only way to get a usable bearer token for a local instance is to mint one fresh:

```bash
# From the hyperspell monorepo root, with the local stack running:
docker compose exec -T core doppler run -- /opt/venv/bin/python -c "
from hyperspell_core.lib.database import set_session
from hyperspell_core.models.apikey import ApiKey, Scope
with set_session():
    key, full_key = ApiKey.create_with_key(app_id=1, label='n8n dev', scopes=[Scope.ALL])
    print(full_key)
"
# Prints: hs2-<id>-<plaintext-secret>  ← use this whole thing as the API Key
```

## Operations and endpoints

Every operation in the node maps to one Hyperspell endpoint. If you're debugging routing, you can hit each endpoint directly with curl:

| Node operation | HTTP | Endpoint |
|---|---|---|
| Document → Add | `POST` | `/memories/add` |
| Document → Get | `GET` | `/memories/get/{source}/{resource_id}` |
| Document → List | `GET` | `/memories/list` |
| Document → Delete | `DELETE` | `/memories/delete/{source}/{resource_id}` |
| Search → Search | `POST` | `/memories/query` with `{"answer": false}` |
| Search → Answer | `POST` | `/memories/query` with `{"answer": true}` |

The `effort` field on Search/Answer is a string enum: `minimal | low | medium | high` — **not** an integer (the SDK docstring is stale on this).

## Build and lint

```bash
npm run build       # compile TypeScript + copy static assets to dist/
npm run lint        # n8n's strict community-node linter
npm run lint:fix    # auto-fix style issues
```

CI runs both on every push and PR.

### Lint quirk worth knowing

The `n8n-nodes-base/node-param-operation-option-action-miscased` rule force-lowercases `action:` strings on `lint:fix`, which mangles "Hyperspell" → "hyperspell". The workaround in this repo is to phrase `action:` strings as "Add a document to the index" / "Search the index" — keeping the brand name out of lint-sensitive surfaces.

## Publishing

Verified community-node submissions require:
- MIT license ✓
- No runtime deps ✓ (this package is declarative-routing only)
- Published via GitHub Actions with npm provenance (mandatory from May 1, 2026)
- Scaffolded from `@n8n/node-cli` ✓

To cut a release, tag a version and let the `.github/workflows/publish.yml` workflow handle the OIDC-provenance publish to npm. See the comments in that file for the one-time npm trusted-publisher setup.

After v0.1.0 is on npm with a green provenance statement, submit via [n8n's Creator Portal](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/) for verification. Verified status is what gets the node installable on n8n Cloud (unverified = self-host only).
