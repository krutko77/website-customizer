/*
 * Cookie-consent баннер для es-trans.ru — фикс локализации
 *
 * ЕДИНСТВЕННОЕ отличие от версии на проде: баннер переводит себя сам.
 * Логика согласия (accept/decline, гейтинг Метрики и формы Bitrix24,
 * ключ в localStorage) НЕ МЕНЯЛАСЬ — строка в строку как на проде.
 *
 * Что чинится:
 *   1. Баннер никогда не переводился на en/cn. Ключи cookie-banner-1…7
 *      в словаре сайта есть, но функция перевода je() в app.min.js
 *      отрабатывает ОДИН раз при загрузке страницы, а баннер создаётся
 *      позже — поэтому на английской и китайской версиях он оставался
 *      русским. Тот же баг и то же решение, что в messenger-consent.js:
 *      свой словарь TRANSLATIONS + чтение localStorage['language'].
 *   2. Опечатка в словаре сайта: у ключа cookie-banner-1 китайский
 *      перевод — "关闭" («Закрыть»), явно скопирован от кнопки закрытия.
 *      Здесь заменён на корректный перевод фразы про cookie.
 *      Проверено: ошибка одинакова во всех 14 копиях словаря в бандле.
 *
 * Подключение (перед </body>) — как сейчас, менять не нужно:
 *   <link rel="stylesheet" href="/css/cookie-banner.css">
 *   <script src="/js/cookie-banner.js" defer></script>
 *
 * Метрика в <head> должна быть завёрнута в window.__esTransInitMetrika
 * (см. cookie-banner/README.md) — этот файл её не трогает, только решает,
 * когда вызвать.
 */
(function () {
	'use strict';

	var STORAGE_KEY = 'es-trans-cookie-consent'; // 'accepted' | 'declined'
	var PRIVACY_URL = '/privacy-policy.html';
	var AGREEMENT_URL = '/agreement.html';
	var DEFAULT_LANG = 'ru';

	// Значения синхронизированы со словарём сайта в app.min.js
	// (ключи cookie-banner-1…7), кроме cn у cookie-banner-1 — см. шапку.
	var TRANSLATIONS = {
		'cookie-banner-1': {
			ru: 'Мы используем файлы cookie для работы сайта и аналитики.',
			en: 'We use cookies to operate our website and for analytics.',
			cn: '我们使用 cookie 来运营网站并进行分析。'
		},
		'cookie-banner-2': {
			ru: 'Продолжая пользоваться сайтом, вы соглашаетесь с',
			en: 'By continuing to use the site, you agree to',
			cn: '继续使用本网站，即表示您同意'
		},
		'cookie-banner-3': {
			ru: 'Политикой конфиденциальности',
			en: 'the Privacy Policy',
			cn: '隐私政策'
		},
		'cookie-banner-4': { ru: 'и', en: 'and', cn: '和' },
		'cookie-banner-5': {
			ru: 'Согласием на обработку данных',
			en: 'Consent to data processing',
			cn: '同意数据处理'
		},
		'cookie-banner-6': { ru: 'Отказаться', en: 'Refuse', cn: '拒绝' },
		'cookie-banner-7': { ru: 'Принимаю', en: 'I accept', cn: '我接受' }
	};

	function getLang() {
		try {
			return localStorage.getItem('language') || DEFAULT_LANG;
		} catch (e) {
			return DEFAULT_LANG;
		}
	}

	function t(key) {
		var entry = TRANSLATIONS[key];
		if (!entry) return '';
		return entry[getLang()] || entry[DEFAULT_LANG];
	}

	function getConsent() {
		try {
			return localStorage.getItem(STORAGE_KEY);
		} catch (e) {
			return null;
		}
	}

	function setConsent(value) {
		try {
			localStorage.setItem(STORAGE_KEY, value);
		} catch (e) {
			/* localStorage недоступен (приватный режим и т.п.) — баннер просто
			   будет показываться повторно, это не критично */
		}
	}

	function initMetrikaIfAllowed() {
		if (typeof window.__esTransInitMetrika === 'function') {
			window.__esTransInitMetrika();
		}
	}

	// Форма заявки Bitrix24 (data-b24-form) грузится отдельным скриптом с
	// cdn-ru.bitrix24.ru и сама решает, когда трекать свою аналитику —
	// поэтому её скрипт вставляется только после ЛЮБОГО выбора (форма нужна
	// для приёма заявок, не только аналитики).
	// Важно: скрипт вставляется ВНУТРЬ #b24-form-mount — с
	// data-skip-moving="true" виджет рендерит себя там, где физически
	// лежит его <script>.
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

	// Собираем баннер через DOM-методы, а не innerHTML-строкой: строка с
	// несколькими одинаковыми классами подряд уже ломалась в
	// messenger-consent (вторая ссылка не рендерилась).
	function span(key) {
		var el = document.createElement('span');
		el.setAttribute('data-lang', key);
		el.textContent = t(key);
		return el;
	}

	function link(href, key) {
		var el = document.createElement('a');
		el.className = 'cookie-banner__link';
		el.setAttribute('data-lang', key);
		el.href = href;
		el.textContent = t(key);
		return el;
	}

	function buildBanner() {
		var banner = document.createElement('div');
		banner.className = 'cookie-banner';
		banner.setAttribute('role', 'dialog');
		banner.setAttribute('aria-live', 'polite');
		banner.setAttribute('aria-label', 'Уведомление об использовании файлов cookie');

		var inner = document.createElement('div');
		inner.className = 'cookie-banner__inner';

		var text = document.createElement('p');
		text.className = 'cookie-banner__text';
		text.appendChild(span('cookie-banner-1'));
		text.appendChild(document.createTextNode(' '));
		text.appendChild(span('cookie-banner-2'));
		text.appendChild(document.createTextNode(' '));
		text.appendChild(link(PRIVACY_URL, 'cookie-banner-3'));
		text.appendChild(document.createTextNode(' '));
		text.appendChild(span('cookie-banner-4'));
		text.appendChild(document.createTextNode(' '));
		text.appendChild(link(AGREEMENT_URL, 'cookie-banner-5'));
		text.appendChild(document.createTextNode('.'));

		var actions = document.createElement('div');
		actions.className = 'cookie-banner__actions';

		var decline = document.createElement('button');
		decline.type = 'button';
		decline.className = 'cookie-banner__btn cookie-banner__btn--decline';
		decline.setAttribute('data-lang', 'cookie-banner-6');
		decline.textContent = t('cookie-banner-6');

		var accept = document.createElement('button');
		accept.type = 'button';
		accept.className = 'cookie-banner__btn cookie-banner__btn--accept';
		accept.setAttribute('data-lang', 'cookie-banner-7');
		accept.textContent = t('cookie-banner-7');

		actions.appendChild(decline);
		actions.appendChild(accept);

		inner.appendChild(text);
		inner.appendChild(actions);
		banner.appendChild(inner);

		return banner;
	}

	function showBanner() {
		var banner = buildBanner();
		document.body.appendChild(banner);

		requestAnimationFrame(function () {
			banner.classList.add('cookie-banner--visible');
		});

		function hide() {
			banner.classList.remove('cookie-banner--visible');
			banner.addEventListener('transitionend', function onEnd() {
				banner.removeEventListener('transitionend', onEnd);
				banner.remove();
			});
			// на случай если transitionend не сработает (нет CSS-transition)
			setTimeout(function () {
				if (banner.parentNode) banner.remove();
			}, 400);
		}

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
	}

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

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
