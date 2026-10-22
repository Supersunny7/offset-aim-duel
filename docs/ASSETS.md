# Asset provenance

This public project repository combines application code/procedural arena work with user-provided third-party game/reference material. No repository-wide open-source license is assigned to models, textures, converted animations, recordings or sounds.

| Material | Recorded source | Use and metadata status |
| --- | --- | --- |
| Agents / Animations / Weapons | User-provided `Agents-20261011T004109Z-1-001.zip`, `Animations-20261011T004113Z-1-001.zip`, `Weapons-20261011T004116Z-1-001.zip` | Jett-based FP/TP rigs, weapon models and converted source clips. Full upstream authorship/license metadata remains unverified. |
| Maps | User-provided `Maps-20261011T004114Z-1-001.zip` | Legacy Ascent B development resources; Foundry is the exposed playable arena. |
| Individual weapon archives | User-provided `valorant-weapon-vandal-rifle.zip` and `valorant-weapon-phantom-rifle.zip`; Sketchfab supplied as a discovery source | Per-model metadata must be established from the original archive/listing; availability does not establish a license. |
| Sound pack | User-provided `Rocklan's Valorant Sound Effects Pack.zip` | Weapon and feedback samples, separate from software dependency licenses. |
| Gameplay recordings | User-provided VALORANT videos | Visual/timing references and selected processed audio excerpts. Raw videos are excluded. |
| Rules/stat references | User-specified [VALORANT Wiki](https://valorant.fandom.com/wiki/Weapons), per-weapon pages, screenshots and videos | Damage/rate/timing references; fixtures and engineering approximations are distinguished in code/tests. |
| Foundry | Project procedural arena implementation | Generated geometry, cover, materials and labels. |
| Three.js / ws | Locked npm dependencies | Upstream MIT notices copied under `docs/licenses/`. |

VALORANT names and referenced game content belong to their respective owners. This project is not affiliated with or endorsed by Riot Games. No permission to relicense third-party game assets is asserted. Public availability does not grant reuse rights to third-party assets. Before redistributing or reusing them, verify the original permissions or supply replacement assets.

Original runtime source representations remain versioned; lossless derivatives are generated separately. `server-data/manifest.json` records generated hitbox source hashes. Original local ZIPs and full reference videos remain outside this repository.
