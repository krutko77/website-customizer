# Отложенная загрузка формы Bitrix24 — инструкция по внедрению

## Контекст

При проверке сайта на соответствие 152-ФЗ (после того как cookie-баннер
для Яндекс.Метрики уже был внедрён и проверен — см.
`../cookie-banner/README.md`) обнаружено: встроенный виджет формы заявки
Bitrix24 (`data-b24-form`, попап `#popup-form`) грузится и стартует
**безусловно**, сразу при загрузке страницы, независимо от выбора в
cookie-баннере.

Проверено Playwright'ом на живом проде (`services-customs.html`, чистый
контекст, до клика на баннере):

```json
{
  "bitrixFiresBeforeConsent": true,
  "bitrixRequestsBeforeConsentCount": 5,
  "bitrixRequestsSample": [
    "https://cdn-ru.bitrix24.ru/b21839048/crm/form/loader_16.js?...",
    "https://cdn-ru.bitrix24.ru/b21839048/crm/form/app.js?...",
    "https://es-trans.bitrix24.ru/bitrix/js/crm/site/form/dist/app.bundle.min.css?...",
    "https://es-trans.bitrix24.ru/bitrix/js/crm/site/form/dist/app.bundle.min.js?...",
    "https://es-trans.bitrix24.ru/bitrix/services/main/ajax.php?action=crm.site.form.handleAnalytics"
  ]
}
```

Запрос `crm.site.form.handleAnalytics` — собственная аналитика Bitrix24,
которая явно стартует до согласия. Это тот же класс проблемы, что был
решён для Метрики: cookie-баннер обещает пользователю «мы используем
cookie только после вашего согласия», но фактически второй трекер уже
работал.

Дополнительно на скриншотах DevTools пользователя было видно, что этот
же виджет ставит cookie `_ga` / `_ga_*` (Google Analytics) — они
принадлежат не сайту es-trans.ru напрямую, а именно Bitrix24
(`es-trans.bitrix24.ru`), это его внутренняя аналитика.

## Согласованное с пользователем поведение

- Скрипт формы (`loader_16.js`) не грузится вообще, пока нет выбора на
  cookie-баннере.
- На месте формы, пока выбор не сделан, показывается заглушка-текст.
- После **любого** выбора (и «Принимаю», и «Отказаться») форма
  становится доступной — это функциональный элемент для приёма заявок,
  не только аналитика, отказ от cookie не должен лишать пользователя
  возможности оставить заявку.
- Яндекс.Метрика (`window.__esTransInitMetrika`) при этом по-прежнему
  запускается только при «Принимаю» — поведение из предыдущего патча не
  меняется.

## Шаг 1 — HTML: заглушка вместо формы

Было (попап `#popup-form`, встречается в одном общем партиале,
инклюдится на каждую страницу — судя по `services-customs.html` и
главной, блок идентичен):

```html
<div id="popup-form" aria-hidden="true" class="popup">
	<div class="popup__wrapper">
		<div class="popup__content">
			<button data-close type="button" class="popup__close" aria-label="Закрыть модальное окно"><span data-lang="popup-11">Закрыть</span></button>
			<div class="popup__text">
				<script async data-b24-form="inline/16/nzutcg" data-skip-moving="true">
					(function(w, d, u) {
						var s = d.createElement('script');
						s.async = true;
						s.src = u + '?' + (Date.now() / 180000 | 0);
						var h = d.getElementsByTagName('script')[0];
						h.parentNode.insertBefore(s, h);
					})(window, document, 'https://cdn-ru.bitrix24.ru/b21839048/crm/form/loader_16.js');
				</script>
			</div>
		</div>
	</div>
</div>
```

Заменить на:

```html
<div id="popup-form" aria-hidden="true" class="popup">
	<div class="popup__wrapper">
		<div class="popup__content">
			<button data-close type="button" class="popup__close" aria-label="Закрыть модальное окно"><span data-lang="popup-11">Закрыть</span></button>
			<div class="popup__text" id="b24-form-mount">
				<p class="b24-form-pending-notice">
					Форма станет доступна после того, как вы примете или откажетесь от
					использования cookie — закройте это окно и сделайте выбор в баннере
					внизу страницы.
				</p>
			</div>
		</div>
	</div>
</div>
```

Скрипт-загрузчик Bitrix24 из HTML убран полностью — его теперь вставляет
`cookie-banner.js` (см. Шаг 3).

## Шаг 2 — CSS для заглушки

Добавить в `cookie-banner.scss` (или любой общий файл стилей проекта):

```scss
.b24-form-pending-notice {
	font-size: 14px;
	line-height: 1.5;
	color: #6b6b68;
}
```

## Шаг 3 — cookie-banner.js: отложенная загрузка формы

Готовый файл целиком, с уже внесёнными правками — **[cookie-banner-b24.js](./cookie-banner-b24.js)**.
Просто замените им текущий `js/cookie-banner.js` в сборке (он идентичен
`../cookie-banner/cookie-banner.js`, но лежит здесь под именем `-b24`
для ясности, что это версия с патчем Bitrix24).

Кратко, что в нём изменилось относительно версии без Bitrix24-патча:

1. Новая функция `initBitrixFormIfAllowed()` — вставляет `loader_16.js`
   с теми же атрибутами (`data-b24-form`, `data-skip-moving`), что были
   в инлайн-скрипте, плюс чистит заглушку из `#b24-form-mount`:

```javascript
function initBitrixFormIfAllowed() {
	if (window.__esTransBitrixFormInited) return;
	window.__esTransBitrixFormInited = true;

	var mount = document.getElementById('b24-form-mount');
	if (!mount) return;

	mount.innerHTML = '';

	var s = document.createElement('script');
	s.async = true;
	s.setAttribute('data-b24-form', 'inline/16/nzutcg');
	s.setAttribute('data-skip-moving', 'true');
	s.src = 'https://cdn-ru.bitrix24.ru/b21839048/crm/form/loader_16.js?' + (Date.now() / 180000 | 0);
	mount.appendChild(s);
}
```

> **Исправлена ошибка первой версии патча** (обнаружена после первого
> деплоя на прод): скрипт нужно вставлять **внутрь `#b24-form-mount`**
> через `mount.appendChild(s)`, а НЕ рядом с первым `<script>` страницы
> через `getElementsByTagName('script')[0].parentNode.insertBefore(...)`.
> Причина: при `data-skip-moving="true"` виджет Bitrix24 рендерит себя
> рядом с тем DOM-узлом, где физически стоит сам `<script>`. Первый
> `<script>` на странице лежит в `<head>` — поэтому форма отрисовывалась
> в `<head>` (невидимо), а попап оставался пустым, хотя куки и запросы к
> `bitrix24.ru` уже появлялись (само согласие и загрузка скрипта
> работали правильно, проблема была только в месте рендера формы). В
> оригинальном инлайн-варианте бага не было, потому что `<script>`
> физически лежал внутри `.popup__text` — тот же эффект теперь
> достигается вставкой в `#b24-form-mount`. Исправление подтверждено
> тестом: после фикса форма (6 полей ввода) рендерится внутри
> `#b24-form-mount`, а не в `<head>`.

2. Вызов `initBitrixFormIfAllowed()` добавлен в **три** места, где уже
   решается судьба согласия (в отличие от Метрики, которая грузится
   только при `accepted`, форма грузится при любом выборе):

```javascript
function start() {
	var consent = getConsent();

	if (consent === 'accepted') {
		initMetrikaIfAllowed();
		initBitrixFormIfAllowed();
		return;
	}

	if (consent === 'declined') {
		initBitrixFormIfAllowed(); // форма доступна и при отказе — трекинга это не касается
		return;
	}

	showBanner();
}
```

И в обработчиках кнопок внутри `showBanner()`:

```javascript
banner.querySelector('.cookie-banner__btn--accept').addEventListener('click', function () {
	setConsent('accepted');
	initMetrikaIfAllowed();
	initBitrixFormIfAllowed();
	hide();
});

banner.querySelector('.cookie-banner__btn--decline').addEventListener('click', function () {
	setConsent('declined');
	initBitrixFormIfAllowed();
	hide();
});
```

## Шаг 4 — проверить

1. Открыть сайт в приватном окне (чистый localStorage), НЕ нажимать
   кнопки баннера.
2. Открыть попап с формой заявки (`#popup-form`) — убедиться, что вместо
   формы показывается текст-заглушка, а не поля ввода.
3. Вкладка Network — убедиться, что запросов к `cdn-ru.bitrix24.ru` и
   `es-trans.bitrix24.ru` нет вообще, пока баннер не закрыт.
4. Нажать «Принимаю» — открыть попап с формой снова, убедиться, что
   форма теперь **видна внутри попапа** (а не просто присутствует
   где-то в DOM — именно видна пользователю в `#b24-form-mount`) и
   работает; в Network должны появиться запросы к `bitrix24.ru`. Если
   попап после согласия пустой при том, что куки/запросы к bitrix24.ru
   уже появились — это признак старого бага с местом вставки `<script>`
   (см. врезку в Шаге 3), проверить, что в коде именно
   `mount.appendChild(s)`, а не вставка рядом с
   `getElementsByTagName('script')[0]`.
5. Повторить с чистого состояния и нажать «Отказаться» вместо
   «Принимаю» — форма также должна стать доступна (в отличие от
   Метрики, которая при отказе не подключается).
6. Обновить страницу после любого выбора — форма должна оставаться
   доступной сразу, без повторного ожидания (проверяет
   `window.__esTransBitrixFormInited` / ветки `start()`).

Проверить на живом проде можно тем же способом, что и для Метрики —
через `playwright-skill` (см. прогоны в истории проекта,
`docs/changelog.md` за 2026-08-12).

## Юридическая оговорка

Как и для баннера Метрики — это техническая реализация, не юридическая
консультация. Разделение «форма — функциональный элемент, доступен при
любом ответе» vs «Метрика — только при согласии» отражает решение,
принятое владельцем сайта в переписке, а не формальное требование
конкретной статьи закона — при сомнениях сверить с юристом заказчика.
