// Node-only data path: JSON avoids retaining V8 code for millions of literal values.
// Browser modules keep their existing per-weapon tables and loading behavior.
import {readFileSync} from 'node:fs';
const cache = new Map();
export function loadServerHitboxes(name) {
 if (!['motion','skeleton','combat'].includes(name)) throw new Error('Unknown hitbox table');
 if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(new URL(`./server-data/${name}.json`, import.meta.url), 'utf8')));
 return cache.get(name);
}
