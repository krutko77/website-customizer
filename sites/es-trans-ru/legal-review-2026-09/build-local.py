#!/usr/bin/env python3
"""Собирает cookie-policy.local.html из исходника для локальной проверки.

Исходник cookie-policy.html содержит директивы Gulp (@@include), которые
браузер не понимает. Скрипт вырезает их, подставляя минимальный <head>.
Шапка и подвал в сборку не попадают — они проверяются только на проде.

    python3 build-local.py && node verify.cjs --local
"""

import re
import pathlib

HERE = pathlib.Path(__file__).parent
SRC = HERE / 'cookie-policy.html'
DST = HERE / 'cookie-policy.local.html'

HEAD = ('<head><meta charset="UTF-8">'
        '<title>Политика cookie | ЕС Транс</title></head>')

src = SRC.read_text(encoding='utf-8')
src = re.sub(r"@@include\('html/_head\.htm',\{[^}]*\}\)", HEAD, src, flags=re.S)
src = re.sub(r"@@include\('html/_(header|footer)\.htm',\{\}\)", '', src)

if '@@include' in src:
    raise SystemExit('остались необработанные директивы @@include')

DST.write_text(src, encoding='utf-8')
print(f'{DST.name}: {len(src)} байт')
