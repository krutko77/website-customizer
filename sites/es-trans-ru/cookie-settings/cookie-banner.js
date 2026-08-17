/*
 * Cookie-consent баннер для es-trans.ru — версия с отзывом согласия
 *
 * Что изменилось по сравнению с версией, которая сейчас на проде:
 *   1. Добавлена точка отзыва согласия — ссылка «Настройки cookie» в футере
 *      (селектор #cookie-settings-link). По клику решение сбрасывается и
 *      баннер показывается заново. Требование 2026 года: отозвать согласие
 *      должно быть не сложнее, чем его дать.
 *   2. Баннер переводит себя сам (свой словарь TRANSLATIONS + чтение
 *      localStorage['language']). На проде у баннера есть data-lang и ключи
 *      cookie-banner-1…7 есть в словаре сайта, но функция перевода je()
 *      отрабатывает ОДИН раз при загрузке страницы, а баннер создаётся
 *      позже — поэтому он оставался русским на en/cn версиях (проверено
 *      Playwright'ом 2026-08-17). Тот же баг и то же решение, что в
 *      messenger-consent.js.
 *   3. При отзыве согласия удаляются cookie Яндекс.Метрики — иначе отзыв
 *      формальный: трекер уже не грузится, но его идентификаторы остаются.
 *
 * Подключение (перед </body>):
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
	// (ключи cookie-banner-1…7) + добавлен ключ cookie-banner-8 для ссылки
	// «Настройки cookie» в футере.
	var TRANSLATIONS = {
		'cookie-banner-1': {
			ru: 'Мы используем файлы cookie для работы сайта и аналитики.',
			en: 'We use cookies to operate our website and for analytics.',
			cn: '我们使用 cookie 来运营我们的网站并进行分析。'
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
		'cookie-banner-7': { ru: 'Принимаю', en: 'I accept', cn: '我接受' },
		'cookie-banner-8': {
			ru: 'Настройки cookie',
			en: 'Cookie settings',
			cn: 'Cookie 设置'
		}
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

	function clearConsent() {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch (e) {}
	}

	// При отзыве согласия недостаточно перестать грузить Метрику — уже
	// поставленные ею cookie надо удалить, иначе идентификатор посетителя
	// продолжает жить. Чистим и на текущем домене, и на домене второго
	// уровня (часть cookie Метрика ставит именно туда).
	function clearTrackingCookies() {
		var names = ['_ym_d', '_ym_isad', '_ym_uid', '_ym_visorc', '_ym_hostIndex', '_yasc', 'bh', 'i', 'mdd', 'yabs-sid', 'yandexuid', 'ymex', 'yuidss'];
		var host = location.hostname;
		var domains = ['', host, '.' + host];

		var parts = host.split('.');
		if (parts.length > 2) {
			domains.push('.' + parts.slice(-2).join('.'));
		}

		names.forEach(function (name) {
			domains.forEach(function (domain) {
				var base = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
				document.cookie = domain ? base + '; domain=' + domain : base;
			});
		});
	}

	function initMetrikaIfAllowed() {
		if (typeof window.__esTransInitMetrika === 'function') {
			window.__esTransInitMetrika();
		}
	}

	// Форма заявки Bitrix24 (data-b24-form) грузится отдельным скриптом с
	// cdn-ru.bitrix24.ru и сама решает, когда трекать свою аналитику — до
	// патча она стартовала сразу при загрузке страницы, до любого выбора в
	// cookie-баннере. Теперь скрипт вставляется только после ЛЮБОГО выбора
	// (форма нужна для приёма заявок, не только аналитики).
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

	// Собираем баннер через DOM-методы: строка innerHTML с несколькими
	// одинаковыми классами подряд уже ломалась в messenger-consent.
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
		// защита от двойного показа (например, повторный клик по «Настройки cookie»)
		if (document.querySelector('.cookie-banner')) return;

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
			clearTrackingCookies();
			initBitrixFormIfAllowed();
			hide();
		});
	}

	// Ссылка «Настройки cookie» в футере: сбрасывает решение, чистит cookie
	// трекеров и показывает баннер заново.
	//
	// Метрику, уже запущенную в текущей вкладке, из JS не остановить — но
	// новых cookie после перезагрузки она не поставит, а старые мы удалили.
	// Поэтому если согласие было дано, после отзыва перезагружаем страницу:
	// так состояние страницы гарантированно соответствует новому выбору.
	function bindSettingsLink() {
		var el = document.getElementById('cookie-settings-link');
		if (!el) return;

		// Ключа cookie-banner-8 в словаре сайта нет, поэтому je() эту ссылку
		// не переведёт — переводим сами.
		el.textContent = t('cookie-banner-8');

		el.addEventListener('click', function (e) {
			e.preventDefault();

			var had = getConsent();
			clearConsent();
			clearTrackingCookies();

			if (had === 'accepted') {
				location.reload();
				return;
			}

			showBanner();
		});
	}

	function start() {
		bindSettingsLink();

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
