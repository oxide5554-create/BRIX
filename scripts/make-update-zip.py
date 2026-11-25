#!/usr/bin/env python3
# ============================================================
#  scripts/make-update-zip.py — ZIP ТОЛЬКО С ИЗМЕНЁННЫМИ ФАЙЛАМИ
#  Берёт git status (modified + untracked), отсекает живые данные
#  (data/, сейвы мира/игроков, bans/admins) и удалённые файлы,
#  складывает остальное в архив с сохранением путей.
# ============================================================
import subprocess, zipfile, os, sys

ROOT = '/home/z/my-project/BRIX'
OUT = '/home/z/my-project/download/brix-update-v0.5.23.zip'
EXCLUDE_PREFIX = ('data/', 'docs/')
EXCLUDE_FILES = {'world-env.json', 'bans.json', 'admins.json',
                 'arena-solids.json', 'world-objs.json'}

st = subprocess.run(['git', 'status', '--porcelain', '-z'],
                    cwd=ROOT, capture_output=True, text=True).stdout
items = st.split('\0')
include = []

def add_file(rel):
    rel = rel.strip().strip('"')
    if not rel or rel in include:
        return
    if any(rel.startswith(p) for p in EXCLUDE_PREFIX):
        return
    if os.path.basename(rel) in EXCLUDE_FILES:
        return
    full = os.path.join(ROOT, rel)
    if os.path.isfile(full):
        include.append(rel)

for it in items:
    if not it.strip():
        continue
    code, path = it[:2], it[3:]
    if code.strip() == 'D':          # удалённые — в архив не кладём
        continue
    if code == '??':
        # нераспечатанная папка (git ставит / в конце при -z? нет —
        # untracked dirs показываются пофайлово только с -uall)
        full = os.path.join(ROOT, path)
        if os.path.isdir(full):
            for dirpath, _, files in os.walk(full):
                for f in files:
                    rel = os.path.relpath(os.path.join(dirpath, f), ROOT)
                    add_file(rel)
        else:
            add_file(path)
    else:
        add_file(path)

# rust без target/ (собирается на месте BUILD-UTILS.bat), но с готовыми
# утилитами, если собраны
include = [f for f in include if not f.startswith('rust/brix-utils/target/')]
for extra in ['rust/brix-utils/target/release/brix-ping',
              'rust/brix-utils/target/release/brix-info',
              'rust/BUILD-UTILS.bat']:
    add_file(extra)

include = sorted(set(include))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for rel in include:
        z.write(os.path.join(ROOT, rel), 'BRIX/' + rel)

mb = os.path.getsize(OUT) / 1048576
print(f'ZIP: {OUT}')
print(f'файлов: {len(include)}, размер: {mb:.1f} МБ')
for rel in include:
    print('  ', rel)
