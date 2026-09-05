#!/usr/bin/env python3
"""Локальный стенд для проверки локализации cookie-баннера и заглушки карты.

Воспроизводит механику прода es-trans.ru:
  * <select id="languageSelect"> с ru/en/cn;
  * функция je() и обработчик change — СКОПИРОВАНЫ дословно из
    js/app.min.js (см. state.md: «любой динамически созданный элемент
    не переводится»), с сохранением главного свойства: je() перебирает
    только ключи словаря страницы (Re) и потому НЕ ВИДИТ ключей баннера;
  * элемент с data-map-src на «странице контактов» — для заглушки карты.

Стенд намеренно НЕ содержит перевода cookie-banner-*: на проде их в Re нет.

Стенд собирается во временную папку (по умолчанию /tmp/stand):

    python3 build-stand.py && \
    node verify-lang-switch.cjs \
        file:///tmp/stand/home.html file:///tmp/stand/contacts.html
"""

import pathlib
import shutil

import os

# Стенд собирается вне репозитория, чтобы не плодить артефакты рядом с патчем.
HERE = pathlib.Path(os.environ.get('STAND_DIR', '/tmp/stand'))
HERE.mkdir(parents=True, exist_ok=True)
BANNER = pathlib.Path(__file__).parent / 'cookie-banner.js'

# Словарь страницы — как Re на проде. Ключей cookie-banner-* здесь нет
# намеренно: сайт их не переводит, этим и вызван баг.
SITE_JS = """
var Re = {
  "footer-menu-1": {ru:"Политика конфиденциальности", en:"Privacy Policy", cn:"隐私政策"},
  "footer-menu-4": {ru:"Политика сookie", en:"Cookie Policy", cn:"Cookie政策"}
};
var qe = ["ru","en","cn"];
var Be = document.getElementById("languageSelect");
var Ne = localStorage.getItem("language") || (function(){
  var e = navigator.language.slice(0,2).toLowerCase();
  if (qe.some(function(t){return t===e})) return e;
})() || "ru";

// Дословно как в app.min.js: querySelector (не All) и только ключи Re.
function je(){
  for (const e in Re) {
    let t = document.querySelector(`[data-lang=${e}]`);
    t && (t.textContent = Re[e][Ne]);
  }
}

if (Be) Be.value = Ne;
je();
if (Be) Be.addEventListener("change", function(e){
  Ne = e.target.value;
  localStorage.setItem("language", Ne);
  je();
});
"""

PAGE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>{title} — стенд</title>
<style>
  body {{ font-family: sans-serif; padding: 20px; }}
  .cookie-banner {{ position: fixed; left: 0; right: 0; bottom: 0;
    background: #f4f4f4; padding: 16px; opacity: 0; }}
  .cookie-banner--visible {{ opacity: 1; }}
  .contact__map {{ width: 600px; height: 300px; background: #eee; }}
  .contact__map iframe {{ width: 100%; height: 100%; }}
</style>
</head>
<body>
<header>
  <select id="languageSelect">
    <option value="ru">RU</option>
    <option value="en">EN</option>
    <option value="cn">CN</option>
  </select>
</header>

<main>
  <h1>{title}</h1>
  {body}
</main>

<footer>
  <a href="/privacy-policy.html" data-lang="footer-menu-1">Политика конфиденциальности</a>
  <a href="/cookie-policy.html" data-lang="footer-menu-4">Политика сookie</a>
</footer>

<script>{site_js}</script>
<script src="cookie-banner.js"></script>
</body>
</html>
"""

MAP = ('<div class="contact__map" data-map-src="https://yandex.ru/map-widget/v1/'
       '?um=constructor%3Adad8984b336259f49920289107cb16f22c256c86243b42100f2d8bb2050ae10d'
       '&amp;source=constructor"></div>')

shutil.copy(BANNER, HERE / 'cookie-banner.js')

(HERE / 'home.html').write_text(
    PAGE.format(title='Главная', body='<p>Контент.</p>', site_js=SITE_JS),
    encoding='utf-8')

(HERE / 'contacts.html').write_text(
    PAGE.format(title='Контакты', body=MAP, site_js=SITE_JS),
    encoding='utf-8')

print('стенд собран: home.html, contacts.html, cookie-banner.js')
