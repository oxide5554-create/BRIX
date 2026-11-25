#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
brix • scripts/gen_embed_add.py — встраивает GLB-модели в js/game/embeddata.js
(v0.5.22: тыква и тыквенная лоза гарантированно с текстурами, даже если
файлы на сервере потерялись/404 — BrixGLB берёт их из BrixEmbed.models).

Запуск:  python3 scripts/gen_embed_add.py
Файл не редактировать руками — правьте список MODELS ниже и перезапускайте.
"""
import base64
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMBED = os.path.join(ROOT, 'js', 'game', 'embeddata.js')

# какие файлы встроить (путь от корня игры → ключ в BrixEmbed.models)
MODELS = [
    'assets/models/pumpkin.glb',
    'assets/models/pumpkin_vine.glb',
    'assets/models/cactus_saguaro.glb',
]

def main():
    with open(EMBED, 'r', encoding='utf-8') as f:
        src = f.read()

    # убираем прошлые автоген-вставки (повторный запуск идемпотентен)
    src = re.sub(r'  /\* ==== v0\.5\.22 AUTO-EMBED \(811\) ==== \*/.*?/\* ==== END AUTO-EMBED ==== \*/\n',
                 '', src, flags=re.S)

    blocks = ['  /* ==== v0.5.22 AUTO-EMBED (811) ====\n'
              '     тыква/лоза/кактус встроены в сборку: BrixGLB берёт их отсюда,\n'
              '     если файла на сервере нет (404) — «серых кубов» больше не будет.\n'
              '     Сгенерировано scripts/gen_embed_add.py — руками не править */']
    for rel in MODELS:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            print('[skip] нет файла:', rel)
            continue
        key = os.path.basename(rel)
        if 'models["' + key + '"]' in src:
            print('[skip] уже встроено:', key)
            continue
        with open(p, 'rb') as fh:
            data = fh.read()
        b64 = base64.b64encode(data).decode('ascii')
        if len(b64) > 4_000_000:
            print('[skip] слишком большой для встраивания:', key, len(data), 'байт')
            continue
        # режем строку на куски по ~120k символов (лимит редакторов/минификаторов)
        chunks = [b64[i:i + 120000] for i in range(0, len(b64), 120000)]
        joined = ' +\n    '.join(['"' + c + '"' for c in chunks])
        blocks.append('  models["%s"] =\n    %s;' % (key, joined))
        print('[ok] встроено: %s (%.1f КБ → base64 %.1f КБ)' % (key, len(data) / 1024, len(b64) / 1024))
    blocks.append('  /* ==== END AUTO-EMBED ==== */\n')

    anchor = '  var models = {};\n'
    if anchor not in src:
        raise SystemExit('не нашёл якорь "var models = {};" в embeddata.js')
    src = src.replace(anchor, anchor + '\n'.join(blocks) + '\n', 1)

    with open(EMBED, 'w', encoding='utf-8') as f:
        f.write(src)
    print('готово →', EMBED)

if __name__ == '__main__':
    main()
