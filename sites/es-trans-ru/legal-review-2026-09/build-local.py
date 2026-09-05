#!/usr/bin/env python3
"""Собирает *.local.html из исходников для локальной проверки.

Исходники (cookie-policy.html, privacy-policy.html) содержат директивы
Gulp (@@include), которые браузер не понимает. Скрипт вырезает их,
подставляя минимальный <head>. Шапка и подвал в сборку не попадают —
они проверяются только на проде.

    python3 build-local.py && node verify.cjs --local
    python3 build-local.py && node verify-privacy.cjs --local
"""

import re
import pathlib

HERE = pathlib.Path(__file__).parent

PAGES = [
    {
        'src': HERE / 'cookie-policy.html',
        'dst': HERE / 'cookie-policy.local.html',
        'title': 'Политика cookie | ЕС Транс',
    },
    {
        'src': HERE / 'privacy-policy.html',
        'dst': HERE / 'privacy-policy.local.html',
        'title': 'Политика обработки персональных данных | ЕС Транс',
    },
]

for page in PAGES:
    head = f'<head><meta charset="UTF-8"><title>{page["title"]}</title></head>'

    src = page['src'].read_text(encoding='utf-8')
    src = re.sub(r"@@include\('html/_head\.htm',\{[^}]*\}\)", head, src, flags=re.S)
    src = re.sub(r"@@include\('html/_(header|footer)\.htm',\{\}\)", '', src)

    if '@@include' in src:
        raise SystemExit(f'{page["src"].name}: остались необработанные директивы @@include')

    page['dst'].write_text(src, encoding='utf-8')
    print(f'{page["dst"].name}: {len(src)} байт')
