# Cookie-баннер для es-trans.ru — инструкция по внедрению

## Что меняется

На сайте уже был сторонний баннер (`cookieinfoscript.com`), но он не
блокировал Яндекс.Метрику до согласия — счётчик стартовал безусловно.
Эти файлы его заменяют: `cookie-banner.js` показывает баннер и решает,
когда инициализировать Метрику; `cookie-banner.css` — оформление в
цветах сайта (`#dc2025` / бело-серый вместо жёлто-серого).

Снимок HTML, по которому готовилась инструкция, сохранён рядом:
`site-snapshot-index.html` (скачан 2026-08-11, `curl https://es-trans.ru/`).

## Шаг 1 — загрузить файлы на сервер сайта

Положить рядом с существующими `css/style.min.css` и `js/app.min.js`:

- `cookie-banner.css` → `css/cookie-banner.css`
- `cookie-banner.js` → `js/cookie-banner.js`

## Шаг 2 — обернуть инициализацию Яндекс.Метрики

В `<head>` сейчас (строки 29–58 в снимке):

```html
<!-- Yandex.Metrika counter -->
<script type="text/javascript">
	(function(m, e, t, r, i, k, a) { ... })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=111461082', 'ym');

	ym(111461082, 'init', {
		ssr: true,
		webvisor: true,
		clickmap: true,
		ecommerce: "dataLayer",
		referrer: document.referrer,
		url: location.href,
		accurateTrackBounce: true,
		trackLinks: true
	});
</script>
<noscript>
	<div><img src="https://mc.yandex.ru/watch/111461082" style="position:absolute; left:-9999px;" alt="" /></div>
</noscript>
<!-- /Yandex.Metrika counter -->
```

Заменить на:

```html
<!-- Yandex.Metrika counter -->
<script type="text/javascript">
	window.__esTransInitMetrika = function () {
		if (window.__esTransMetrikaInited) return;
		window.__esTransMetrikaInited = true;

		(function(m, e, t, r, i, k, a) {
			m[i] = m[i] || function() {
				(m[i].a = m[i].a || []).push(arguments)
			};
			m[i].l = 1 * new Date();
			for (var j = 0; j < document.scripts.length; j++) {
				if (document.scripts[j].src === r) {
					return;
				}
			}
			k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a)
		})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=111461082', 'ym');

		ym(111461082, 'init', {
			ssr: true,
			webvisor: true,
			clickmap: true,
			ecommerce: "dataLayer",
			referrer: document.referrer,
			url: location.href,
			accurateTrackBounce: true,
			trackLinks: true
		});
	};
</script>
<noscript>
	<div><img src="https://mc.yandex.ru/watch/111461082" style="position:absolute; left:-9999px;" alt="" /></div>
</noscript>
<!-- /Yandex.Metrika counter -->
```

> **Важно (найдено и исправлено 2026-08-12, после первого деплоя):**
> в первой версии этого патча внутрь `__esTransInitMetrika` был вынесен
> только вызов `ym(..., 'init', ...)`, а сама IIFE, которая грузит
> `https://mc.yandex.ru/metrika/tag.js`, оставалась СНАРУЖИ и
> выполнялась сразу при загрузке страницы. Формально `ym('init')` не
> вызывался до согласия — но сам факт запроса `tag.js` к `mc.yandex.ru`
> уже приводил к тому, что Яндекс выставлял третьесторонний cookie `bh`
> (Client Hints/антифрод-отпечаток браузера) ДО любого выбора в
> баннере. Подтверждено Playwright-тестом на живом проде: `tag.js`
> запрашивался и cookie `bh` присутствовал в контексте браузера ещё до
> клика на «Принимаю»/«Отказаться». Исправление — вся IIFE (создание
> `<script src="tag.js">`) перенесена ВНУТРЬ `__esTransInitMetrika`,
> как показано в блоке выше: теперь `tag.js` не запрашивается вообще,
> пока пользователь не нажмёт «Принимаю» (Метрика, как и раньше,
> подключается только при согласии, не при отказе).
>
> Если это исправление уже применено на сайте — при повторной проверке
> отредактируйте `<head>` ещё раз, полностью заменив текущий блок
> `<!-- Yandex.Metrika counter -->...<!-- /Yandex.Metrika counter -->`
> на приведённый выше.

Разница: раньше счётчик (`tag.js`) подгружался сразу при загрузке
страницы независимо от согласия — теперь вся загрузка `tag.js` и вызов
`ym(..., 'init', ...)`, который реально включает сбор данных и
вебвизор, находятся внутри функции `window.__esTransInitMetrika`,
которую `cookie-banner.js` вызовет только после нажатия «Принимаю»
(или сразу при загрузке, если согласие уже было дано ранее).

Также стоит подключить `css/cookie-banner.css` в `<head>` рядом с
`css/style.min.css`:

```html
<link rel="stylesheet" href="css/cookie-banner.css">
```

## Шаг 3 — заменить старый баннер на новый

В конце `<body>` (строка 897 в снимке) сейчас:

```html
<script src="js/app.min.js?_v=20260810163800"></script>
<script id="cookieinfo" src="//cookieinfoscript.com/js/cookieinfo.min.js?_v=20260810163800" data-bg="#645862" data-fg="#FFFFFF" data-link="#F1D600" data-font-size="13px" data-message="..." data-moreinfo="/agreement.html" data-linkmsg="..." data-close-text="...">
</script>
```

Удалить строку с `id="cookieinfo"` целиком и заменить на:

```html
<script src="js/app.min.js?_v=20260810163800"></script>
<script src="js/cookie-banner.js" defer></script>
```

## Шаг 4 — проверить

1. Открыть сайт в приватном окне браузера (чистый localStorage).
2. Убедиться, что внизу экрана появился баннер с текстом, ссылками на
   «Политику конфиденциальности» и «Соглашение», и кнопками «Отказаться» /
   «Принимаю».
3. Открыть вкладку Network — убедиться, что запросов к `mc.yandex.ru`
   ВООБЩЕ НЕТ (ни `tag.js`, ни `watch/...`), пока баннер не закрыт. Также
   проверить вкладку Application → Cookies — cookie `bh` (домен
   `.yandex.ru`) до согласия быть не должно.
4. Нажать «Принимаю» — баннер должен закрыться, должны появиться запрос
   на `mc.yandex.ru/metrika/tag.js`, затем `mc.yandex.ru/watch/...`, и
   cookie `bh`/`_ym_*`.
5. Обновить страницу — баннер повторно показываться не должен (согласие
   сохранено в `localStorage['es-trans-cookie-consent']`).
6. Очистить localStorage, открыть сайт и нажать «Отказаться» — баннер
   должен закрыться, и Метрика не должна инициализироваться ни на этой
   странице, ни при последующих открытиях сайта (пока согласие не
   изменится вручную, например через очистку localStorage).

Проверить всё это на живом сайте нельзя без доступа к деплою — этот шаг
стоит выполнить через `playwright-skill`/`webapp-testing` на локальной
копии страницы, либо вручную после выкладки на прод.

## Юридическая оговорка

Это техническая реализация баннера согласия, а не юридическая консультация.
Формулировки и то, что считается «согласием» по 152-ФЗ, лучше сверить с
юристом заказчика — данный текст и поведение (согласие/отказ, блокировка
трекера до согласия) написаны по общей практике cookie-consent, без
привязки к конкретной юрисдикции сверх РФ-контекста сайта (`.ru`, ru/en/zh
контент).
