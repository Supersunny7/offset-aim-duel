# Offset / Aim Duel — free-host trial

Node.js 24. Install with `npm ci --omit=dev --ignore-scripts`.
Run with `NODE_ENV=production`, `NODE_OPTIONS=--max-old-space-size=256`, and
`node server.mjs`. The host supplies `PORT`. Health check: `/health`.

Includes every current weapon, original animation assets, and losslessly
extracted server hitbox data. Generated server-data files must ship with the app.
Source tables are retained. See server-data/manifest.json for source hashes.
Production blocks lab pages. Keep one instance: rooms live in memory and reset
when the process restarts. No database is required.

render.yaml selects the FREE Ohio instance. Local Windows memory tests passed;
hosted Linux memory, 0.1 CPU performance, and remote two-device play remain unverified.
Free Render sleeps after 15 minutes without inbound HTTP/WebSocket traffic and
typically takes about one minute to wake. Check account bandwidth/build quotas.
No hosted service has been created by preparing this folder.

Docker definition included; Docker image has not been built locally.
