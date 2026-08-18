#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Патч es-trans.ru: приведение Политики и Согласия в соответствие
фактической передаче ПДн (Яндекс.Метрика, Битрикс24, хостинг Timeweb).

Правки:
  1. privacy-policy.html, п. 6.3 — снять абсолют «никогда, ни при каких
     условиях», добавить перечень лиц, обрабатывающих ПДн по поручению.
  2. agreement.html — добавить «передачу» в перечень действий с ПДн
     (ч. 4 ст. 9 152-ФЗ) + тот же перечень получателей.
  3. Оба файла — обновить дату документа.

Запуск:
    python3 apply-patch.py                 # собрать .AFTER.html из .BEFORE.html
    python3 apply-patch.py --date 19.08.2026

Скрипт идемпотентен: повторный запуск на уже пропатченном файле
завершится ошибкой «якорь не найден», а не сделает двойную вставку.

⚠️ ИСТОРИЧЕСКИЙ АРТЕФАКТ (18.08.2026). Патч выложен на прод, после чего
владелец внёс поверх него свои правки:
  * снял класс `no-style` с обоих списков получателей — появилась
    сквозная нумерация 1/2/3;
  * в `agreement.html` переставил блоки местами и добавил заголовок
    «Перечень действий с персональными данными...» перед абзацем
    о действиях (было: блок стоял после «Срока действия и порядка
    отзыва»).
Эти правки структурные, скриптом не воспроизводятся. Файлы
`*.AFTER.html` пересняты с прода и содержат финальную версию.

НЕ запускайте этот скрипт для повторной выкладки — он соберёт версию
без правок владельца. Скрипт оставлен как документация того, что именно
менялось относительно `*.BEFORE.html`.
"""

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Дата по умолчанию — день подготовки патча. Переопределяется --date.
DEFAULT_DATE = "18.08.2026"
OLD_DATE = "12.08.2026"

TAB = "\t"


def indent(level: int) -> str:
    return TAB * level


# --- Общий блок: перечень лиц, обрабатывающих ПДн по поручению -------------
# Классы взяты из существующей разметки страниц:
#   вложенный список в политике — ol.policy__list.list.padding-left.no-style
#   элементы — li.list__item.margin-bottom-10
def recipients_list(list_class: str, base: int) -> str:
    i = indent(base)
    ii = indent(base + 1)
    return (
        f'{i}<ol class="{list_class} padding-left no-style">\n'
        f'{ii}<li class="list__item margin-bottom-10">ООО «ЯНДЕКС» (ИНН 7736207543, 119021,\n'
        f'{ii}{TAB}г. Москва, ул. Льва Толстого, д. 16) — сервис интернет-статистики\n'
        f'{ii}{TAB}Яндекс.Метрика: обработка обезличенных данных о посещениях Сайта;</li>\n'
        f'{ii}<li class="list__item margin-bottom-10">ООО «1С-Битрикс» (ИНН 7717586110, 109544,\n'
        f'{ii}{TAB}г. Москва, б-р Энтузиастов, д. 2) — CRM Битрикс24: хранение и обработка\n'
        f'{ii}{TAB}данных, переданных Пользователем через формы обратной связи;</li>\n'
        f'{ii}<li class="list__item margin-bottom-10">АО «ТаймВэб» (ИНН 7810353960, 196006,\n'
        f'{ii}{TAB}г. Санкт-Петербург, ул. Заставская, д. 22, к. 2, лит. А) — услуги хостинга:\n'
        f'{ii}{TAB}размещение Сайта и хранение данных на серверах, расположенных на территории\n'
        f'{ii}{TAB}Российской Федерации.</li>\n'
        f'{i}</ol>\n'
    )


# --- Правка 1: privacy-policy.html, п. 6.3 ---------------------------------
POLICY_ANCHOR = (
    '<li class="list__item margin-bottom-20">Персональные данные Пользователя никогда, ни при каких\n'
    '\t\t\t\t\t\t\tусловиях не будут переданы третьим лицам, за исключением случаев, связанных с исполнением\n'
    '\t\t\t\t\t\t\tдействующего законодательства.</li>'
)


def policy_replacement() -> str:
    i = indent(6)   # уровень <li> в списке раздела 6
    t = indent(7)   # уровень текста внутри <li>
    return (
        f'<li class="list__item margin-bottom-20">\n'
        f'{t}<div class="margin-bottom-10">Персональные данные Пользователя не передаются третьим\n'
        f'{t}{TAB}лицам, за исключением случаев, предусмотренных настоящей Политикой и действующим\n'
        f'{t}{TAB}законодательством Российской Федерации. Оператор поручает обработку персональных\n'
        f'{t}{TAB}данных следующим лицам, действующим по поручению Оператора и обязанным соблюдать\n'
        f'{t}{TAB}конфиденциальность персональных данных и требования Федерального закона\n'
        f'{t}{TAB}от 27.07.2006 № 152-ФЗ «О персональных данных»:</div>\n'
        + recipients_list("policy__list list", 7)
        + f'{t}<div>Оператор не осуществляет продажу персональных данных и не передаёт их третьим\n'
        f'{t}{TAB}лицам в целях, не указанных в разделе 4 настоящей Политики.</div>\n'
        f'{i}</li>'
    )


# --- Правка 2: agreement.html, перечень действий ---------------------------
AGREEMENT_ANCHOR = (
    '<p class="soglashenie__content margin-bottom-20">Пользователь, принимая настоящее Согласие, выражает\n'
    '\t\t\t\t\t\tсвою заинтересованность и полное согласие, что обработка его персональных данных может включать\n'
    '\t\t\t\t\t\tв себя\n'
    '\t\t\t\t\t\tследующие действия: сбор, систематизацию, накопление, хранение, уточнение (обновление,\n'
    '\t\t\t\t\t\tизменение),\n'
    '\t\t\t\t\t\tиспользование, уничтожение.</p>'
)


def agreement_replacement() -> str:
    p = indent(5)   # уровень <p> в agreement
    t = indent(6)
    return (
        f'<p class="soglashenie__content margin-bottom-20">Пользователь, принимая настоящее Согласие, выражает\n'
        f'{t}свою заинтересованность и полное согласие, что обработка его персональных данных может включать\n'
        f'{t}в себя\n'
        f'{t}следующие действия: сбор, запись, систематизацию, накопление, хранение, уточнение\n'
        f'{t}(обновление, изменение), извлечение, использование, передачу (предоставление, доступ)\n'
        f'{t}лицам, указанным в настоящем Согласии, обезличивание, блокирование, удаление,\n'
        f'{t}уничтожение.</p>\n'
        f'{p}<p class="soglashenie__content margin-bottom-20">Обработка персональных данных Пользователя\n'
        f'{t}осуществляется Оператором, а также следующими лицами, действующими по поручению\n'
        f'{t}Оператора и обязанными соблюдать конфиденциальность персональных данных:</p>\n'
        + recipients_list("soglashenie__list list margin-bottom-20", 5)
    )


PATCHES = [
    {
        "file": "privacy-policy",
        "name": "п. 6.3 — перечень лиц вместо абсолютного запрета передачи",
        "anchor": POLICY_ANCHOR,
        "replacement": policy_replacement,
    },
    {
        "file": "agreement",
        "name": "перечень действий: добавлена передача + получатели",
        "anchor": AGREEMENT_ANCHOR,
        "replacement": agreement_replacement,
    },
]


def patch_file(stem: str, new_date: str) -> bool:
    src = HERE / f"{stem}.BEFORE.html"
    dst = HERE / f"{stem}.AFTER.html"

    if not src.exists():
        print(f"  ОШИБКА: нет файла {src.name}", file=sys.stderr)
        return False

    html = src.read_text(encoding="utf-8")
    original = html

    for patch in PATCHES:
        if patch["file"] != stem:
            continue
        anchor = patch["anchor"]
        count = html.count(anchor)
        if count != 1:
            print(
                f"  ОШИБКА: якорь «{patch['name']}» найден {count} раз (ожидалось 1).\n"
                f"  Вероятно, разметка на проде изменилась — обнови .BEFORE.html.",
                file=sys.stderr,
            )
            return False
        html = html.replace(anchor, patch["replacement"](), 1)
        print(f"  ✓ {patch['name']}")

    # Дата документа
    date_anchor = f">{OLD_DATE}</p>"
    if date_anchor in html:
        html = html.replace(date_anchor, f">{new_date}</p>", 1)
        print(f"  ✓ дата документа: {OLD_DATE} → {new_date}")
    else:
        print(f"  ! дата {OLD_DATE} не найдена — проверь вручную", file=sys.stderr)

    if html == original:
        print("  ОШИБКА: файл не изменился", file=sys.stderr)
        return False

    dst.write_text(html, encoding="utf-8")
    print(f"  → записан {dst.name}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=DEFAULT_DATE, help="новая дата документов, ДД.ММ.ГГГГ")
    args = ap.parse_args()

    if not re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", args.date):
        print("Дата должна быть в формате ДД.ММ.ГГГГ", file=sys.stderr)
        return 2

    ok = True
    for stem in ("privacy-policy", "agreement"):
        print(f"\n{stem}.html:")
        ok = patch_file(stem, args.date) and ok

    print("\nГотово." if ok else "\nЗавершено с ошибками.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
