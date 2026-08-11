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

	window.__esTransInitMetrika = function () {
		if (window.__esTransMetrikaInited) return;
		window.__esTransMetrikaInited = true;
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

Разница: сам счётчик (`tag.js`) по-прежнему подгружается сразу (это лёгкий
загрузчик, он ничего не трекает), но вызов `ym(..., 'init', ...)` — то, что
реально включает сбор данных и вебвизор — вынесен в функцию
`window.__esTransInitMetrika`, которую `cookie-banner.js` вызовет только
после нажатия «Принимаю» (или сразу при загрузке, если согласие уже было
дано ранее).

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
3. Открыть вкладку Network — убедиться, что `mc.yandex.ru/watch/...`
   (событие визита) НЕ отправляется, пока баннер не закрыт.
4. Нажать «Принимаю» — баннер должен закрыться, а запрос на
   `mc.yandex.ru/watch/...` появиться.
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
