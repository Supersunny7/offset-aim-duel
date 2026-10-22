# Development

Use Node.js 24 and the committed package-lock.json. Runtime dependencies are Three.js 0.180.0 and ws 8.22.0. No database or bundler is required.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci --ignore-scripts` | Install locked dependencies. |
| `npm start` | Serve HTTP, assets, and WebSockets on port 5180. |
| `npm run build` | Generate `.static-runtime/` models and `.static-gzip/` assets. |
| `npm test` | Build those artifacts, then run the Node test suite with concurrency 2. |
| `npm run verify:hitboxes` | Compare server JSON to the original numeric source exports. |

Tests create local servers on ephemeral ports. Leave `DUEL_URL` unset for normal verification; do not point tests at active public matches. Test output and fixtures stay under ignored `tests/.artifacts/`. Leave `NODE_ENV` unset when running the full suite; individual tests enable production when needed.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP/WebSocket port; defaults to 5180. |
| `NODE_ENV=production` | Production delivery; blocks development lab pages. |
| `NODE_OPTIONS=--max-old-space-size=256` | Heap cap used on the free host. |
| `PUBLIC_ORIGIN` | Optional exact WebSocket origin allowed behind a reverse proxy. |
| `NODE_VERSION` | Render setting, currently 24. |

PowerShell on another local port:

```powershell
$env:PORT = '5185'
npm start
```

POSIX:

```sh
PORT=5185 npm start
```

## Repository layout

```text
public/                    Browser UI, Three.js runtime, assets and labs
server.mjs                 Rooms and authoritative HTTP/WebSocket game server
weapons.mjs                Weapon parameters and damage
shared.mjs                 Shared movement, collision and tracing
movement-*.mjs             Movement feel and prediction
hitbox-*.mjs                Source animation/hitbox tables and helpers
server-data/               Lossless JSON used by Node
runtime-*.mjs              Lossless runtime-model transformations
static-assets.mjs          Streaming delivery and cache validation
prepare-static-assets.mjs  Build-time artifact generation
tests/                     Node tests, fixtures and ignored local evidence
tools/                     Portable hitbox generation and verification
docs/                      Architecture, deployment, validation and provenance
render.yaml                Existing Free Ohio configuration; manual deploys
Dockerfile                 Optional container definition
```

`release-manifest.json` is a retained historical deployment snapshot, not a manifest of the current repository. It is not read by the runtime. Current build artifacts have their own generated `.static-gzip/manifest.json`.

## Animation and input regression checks

`/?debug=1` exposes diagnostic DOM output; `/?hitboxes=1` shows hitbox overlays. Labs are available in development and blocked by production routes.

In debug mode, `#diagnostics` includes `frameProfile`: the latest 600 unsmoothed RAF intervals, p50/p95/p99, CPU update/world/viewmodel submission timings, a bounded hitch history, scope windows and shader-program counts. Inactive/hidden gaps are excluded. CPU submission/wait time is not a GPU timer-query result. The optional Chromium heap reading is approximate, can include shared contexts, and is `null` when unsupported; actual VRAM bytes are not measured. Profiling histories are bounded and the profiler is not created in normal play.

Loading optimization must preserve original skeleton bases, clip keys/timing, and approved holding views. Check parsed/bound clips, native grip/ADS references, resident FP/TP models, hitbox chunks, textures, materials and buffers rather than treating download completion as readiness.

Exercise Esc toggling, B toggling, movement while shopping, delayed resources, lost pointer capture, returning to earlier guns, and firing after closing the shop. Async readiness must not override explicit settings or leave actions.

## Generated server data

After changing one of the three source tables, use Python 3 (standard library only):

```sh
python tools/build-server-hitboxes.py
npm run verify:hitboxes
```

Commit the matching source changes, `server-data/*.json`, and manifest. The generated tables retain every numeric sample.
