# Deployment

## Existing service

- URL: https://offset-aim-duel.onrender.com/
- Render Free, Ohio, Node.js 24, one instance.
- Repository/default deployment branch: `Supersunny7/offset-aim-duel`, `codex/render-free`.
- Build: `npm ci --omit=dev --ignore-scripts && node prepare-static-assets.mjs`.
- Start: `node server.mjs`; health: `/health`.
- Heap cap: `NODE_OPTIONS=--max-old-space-size=256`.
- Automatic deployment is off; a push alone does not update the live game.

The configuration is in [render.yaml](../render.yaml). Keep `server-data/` and runtime assets in the checkout. The build generates optimized artifacts; node_modules and local caches are not committed.

## Release procedure

1. In a clean checkout, run `npm ci --ignore-scripts`, `npm test`, and `npm run verify:hitboxes`.
2. Review the diff, assets and regressions, then commit and push.
3. In the existing Render service, choose **Manual Deploy → Deploy latest commit**. Keep the existing plan and region.
4. Wait for Live and a successful `/health`. Verify the served version, not only build success.
5. Create/join with fresh browser sessions; wait for all 18 items; switch guns, close B, fire, and check Esc. Validate a two-client match/rematch for gameplay changes.

Deploying restarts the process and clears in-memory rooms; schedule updates around active matches.

## Operating boundaries

The developer's computer can be switched off; the cloud service hosts the game. An idle free instance can sleep and the next request may wait for wake-up. Check current quotas and service limits in the provider dashboard.

There is no persistent database or shared room store. Multiple independent instances require shared state or explicit room routing; do not scale this implementation blindly. A restart loses active matches. The heap setting is not a total-process or browser-memory guarantee.

Full armory preparation deliberately increases initial wait and client residency. It removes normal on-demand model/animation preparation while buying weapons, but cannot guarantee constant frame times on every device.

## Docker

The included Node 24 container definition builds optimized assets, runs as the `node` user, and exposes 8080. It has not been independently built/accepted in the recorded release.
