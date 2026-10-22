"""Extract lossless JSON from generated animation tables without executing JS.

Original generated modules remain the source of truth and browser fallback.
Run again whenever the three source tables change.
"""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'server-data'
TABLES = {
    'motion': ('hitbox-motion-data.mjs', ['HITBOX_MOTION', 'AIM_ANCESTORS']),
    'skeleton': ('hitbox-skeleton-data.mjs', ['HITBOX_SKELETON']),
    'combat': ('hitbox-combat-skeleton-data.mjs', ['HITBOX_COMBAT_SKELETON']),
}

if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    manifest = {}
    for name, (filename, exports) in TABLES.items():
        source = (ROOT / filename).read_bytes()
        text = source.decode('utf8')
        data = {}
        for export in exports:
            marker = f'export const {export}='
            start = text.index(marker) + len(marker)
            data[export], consumed = json.JSONDecoder().raw_decode(text[start:])
            if text[start + consumed:].lstrip()[0] != ';':
                raise ValueError(f'Unexpected expression after {export}')
        payload = json.dumps(data, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')
        (OUT / f'{name}.json').write_bytes(payload)
        manifest[name] = {'source': filename, 'sourceSha256': hashlib.sha256(source).hexdigest(),
                          'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(), 'exports': exports}
        print(f'{name}: {len(payload)} bytes; all numeric samples retained')
        del text, source, payload, data
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
