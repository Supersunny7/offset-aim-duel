# Verification and known limitations

## Recorded playable release

Runtime commit: `d55f0338c73406efcb6003ebfb4798c92cbd81e2`, 2026-10-21. Repository documentation/test-portability work follows that version without changing game modules.

- Full regression: **251 passed, 0 failed**, 86.392 seconds. Focused preparation/control checks: **26 passed**.
- Public release: five changed browser modules matched local release hashes; `/health` succeeded.
- Public fresh-entry sample: **20.203 seconds**, 18/18 equipment items and 20/20 preparation units; 18 hitbox sets and 46 audio assets ready. This is one device/network sample, not a performance guarantee.
- All 18 public armory selections were ready, with **0 evictions** and unchanged model-loading timings across the sequence.
- Closing the shop then directly firing Operator changed ammunition **5 → 4**, with one confirmed shot, playing state true, no recovery prompt and no console error. No Esc/Resume intervention.
- A local test delayed Operator GLB by 25 seconds: preparation took **34.246 seconds**; unfinished graphics kept the loading screen visible, then entry completed automatically.

[Gameplay screenshot](images/gameplay.png) · [Loading screenshot](images/loading.png)

## Reproduce

`npm test` builds required runtime artifacts and runs the Node suite. Coverage includes real WebSocket combat/movement/respawn/rematch/reconnect, damage and weapon modes, animation-source invariants, hitbox transforms, lossless models/textures, static cache/streaming, and input/shop/loading recovery.

VM and Three.js CPU tests do not replace GPU rendering or human playtests. Use separate browser sessions for UI checks and physically separate devices/connections for remote-play checks. GitHub Actions verifies the portable build and tests; only its actual result establishes CI success.

## Remaining limitations

- Full preparation increases initial waiting and browser RAM/VRAM use. Refreshing reconstructs runtime objects even with cached HTTP files.
- No universal FPS, frame-time, uptime, or exact VALORANT-fidelity guarantee.
- Some sounds are processed user recordings; some timing/presentation values are engineering approximations.
- Selectable agents do not each have a distinct original rig and full animation set.
- Rooms disappear on server restart; free-provider wake-up is separate from asset loading.
- Sustained switching by both players, long-session memory and physical cross-device browser behavior deserve continued focused testing.
- The Docker definition has not been independently built/accepted in the recorded release.

The root `release-manifest.json` is an earlier retained snapshot, not a validator of the current repository.

## 2026-10-22 first-scope pipeline validation

- Local IAB/Chromium, same machine: original Operator first scope added 8 shader programs and reached 113.4 ms in the viewmodel render submission/wait stage (117 ms maximum RAF interval).
- Final loading warm-up includes a one-pixel covered canvas draw of opaque and fading scope materials. First Operator scope added no programs: 2.3 ms maximum viewmodel stage, 17.1 ms maximum interval over 45 frames. Marshal: 1.5 ms and 17.4 ms, no added programs.
- Operator 2.5x/5x and Marshal scope/fire/exit verified through real UI input; ammunition decreased and play continued without Esc/Resume. Original animation keys, view transforms and gameplay values were not changed.
- Full local suite: 260/260 passed. Added bounded raw frame/stage and approximate Chromium heap diagnostics in debug mode only. CPU submission/wait is not GPU timing; heap may include shared contexts; exact VRAM remains unavailable. Background-tab throttling must not be interpreted as an in-game rendering regression. These are device-specific samples, not universal FPS guarantees.
