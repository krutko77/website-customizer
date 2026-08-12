/*
 * Универсальный cookie-consent баннер.
 *
 * Подключение (перед </body>):
 *   <link rel="stylesheet" href="/css/cookie-banner.css">
 *   <script src="/js/cookie-banner.js" defer></script>
 *
 * Перед подключением:
 *   1) Заполнить блок CONFIG ниже под конкретный сайт.
 *   2) В <head> обернуть ВСЮ загрузку счётчика(ов) аналитики (включая
 *      сам <script src="...tag.js">, а не только вызов init) в функцию
 *      window.__cbInitAnalytics — см. cookie-banner.html, пример там же.
 *      Частая ошибка — обернуть только init-вызов, оставив загрузчик
 *      счётчика снаружи: тогда сторонний домен всё равно получает
 *      сетевой запрos и может выставить cookie ещё до согласия.
 *   3) Если CONFIG.ENABLE_BITRIX_GATE === true — заменить инлайн-скрипт
 *      формы Bitrix24 в HTML на заглушку с id="b24-form-mount"
 *      (пример — в cookie-banner.html).
 *
 * Подробности и разбор реальных багов, на которых проверен этот шаблон —
 * см. README.md рядом с этим файлом.
 */
(function () {
	'use strict';

	var CONFIG = {
		// Уникальный на проект ключ localStorage — не переиспользуй между
		// разными сайтами на одном домене/поддоменах.
		STORAGE_KEY: 'cookie-consent',

		PRIVACY_URL: '/privacy-policy.html',
		AGREEMENT_URL: '/agreement.html',

		// Сценарий B (см. README.md): встроенная форма Bitrix24, которая
		// сама делает сетевые запросы при загрузке страницы и должна быть
		// отложена наравне со счётчиками аналитики.
		ENABLE_BITRIX_GATE: false,
		BITRIX_FORM_ID: '', // например 'inline/16/xxxxxx' — из кода формы Bitrix24
		BITRIX_APP_ID: '', // ID приложения Bitrix24 — префикс пути к loader_16.js,
		                    // напр. 'b21839048' — из исходного инлайн-скрипта формы
		BITRIX_MOUNT_ID: 'b24-form-mount',
		// true  — форма доступна после ЛЮБОГО выбора (accept ИЛИ decline);
		//         используется, если форма — функциональный элемент (приём
		//         заявок), а не просто аналитика (согласовать с заказчиком).
		// false — форма доступна только после accept, как и аналитика.
		BITRIX_AVAILABLE_ON_DECLINE: true,

		TEXT: {
			message:
				'Мы используем файлы cookie для работы сайта и аналитики. ' +
				'Продолжая пользоваться сайтом, вы соглашаетесь с {privacyLink} ' +
				'и {agreementLink}.',
			privacyLinkText: 'Политикой конфиденциальности',
			agreementLinkText: 'Соглашением об обработке данных',
			decline: 'Отказаться',
			accept: 'Принимаю'
		}
	};

	function getConsent() {
		try {
			return localStorage.getItem(CONFIG.STORAGE_KEY);
		} catch (e) {
			return null;
		}
	}

	function setConsent(value) {
		try {
			localStorage.setItem(CONFIG.STORAGE_KEY, value);
		} catch (e) {
			/* localStorage недоступен (приватный режим и т.п.) — баннер
			   просто будет показываться повторно, это не критично */
		}
	}

	function initAnalyticsIfAllowed() {
		if (typeof window.__cbInitAnalytics === 'function') {
			window.__cbInitAnalytics();
		}
	}

	// См. README.md, принцип 4: скрипт вставляется ВНУТРЬ mount-контейнера
	// через appendChild, а НЕ рядом с первым <script> страницы через
	// insertBefore — иначе виджеты с data-skip-moving рендерятся не там,
	// где ожидается (например, невидимо в <head>).
	function initBitrixFormIfAllowed() {
		if (!CONFIG.ENABLE_BITRIX_GATE) return;
		if (window.__cbBitrixFormInited) return;
		window.__cbBitrixFormInited = true;

		var mount = document.getElementById(CONFIG.BITRIX_MOUNT_ID);
		if (!mount) return;

		mount.innerHTML = '';

		var s = document.createElement('script');
		s.async = true;
		s.setAttribute('data-b24-form', CONFIG.BITRIX_FORM_ID);
		s.setAttribute('data-skip-moving', 'true');
		s.src = 'https://cdn-ru.bitrix24.ru/' + CONFIG.BITRIX_APP_ID + '/crm/form/loader_16.js?' + (Date.now() / 180000 | 0);
		mount.appendChild(s);
	}

	function buildBanner() {
		var banner = document.createElement('div');
		banner.className = 'cookie-banner';
		banner.setAttribute('role', 'dialog');
		banner.setAttribute('aria-live', 'polite');
		banner.setAttribute('aria-label', 'Уведомление об использовании файлов cookie');

		var message = CONFIG.TEXT.message
			.replace(
				'{privacyLink}',
				'<a class="cookie-banner__link" href="' + CONFIG.PRIVACY_URL + '">' + CONFIG.TEXT.privacyLinkText + '</a>'
			)
			.replace(
				'{agreementLink}',
				'<a class="cookie-banner__link" href="' + CONFIG.AGREEMENT_URL + '">' + CONFIG.TEXT.agreementLinkText + '</a>'
			);

		banner.innerHTML =
			'<div class="cookie-banner__inner">' +
				'<p class="cookie-banner__text">' + message + '</p>' +
				'<div class="cookie-banner__actions">' +
					'<button type="button" class="cookie-banner__btn cookie-banner__btn--decline">' + CONFIG.TEXT.decline + '</button>' +
					'<button type="button" class="cookie-banner__btn cookie-banner__btn--accept">' + CONFIG.TEXT.accept + '</button>' +
				'</div>' +
			'</div>';

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
			setTimeout(function () {
				if (banner.parentNode) banner.remove();
			}, 400);
		}

		banner.querySelector('.cookie-banner__btn--accept').addEventListener('click', function () {
			setConsent('accepted');
			initAnalyticsIfAllowed();
			initBitrixFormIfAllowed();
			hide();
		});

		banner.querySelector('.cookie-banner__btn--decline').addEventListener('click', function () {
			setConsent('declined');
			if (CONFIG.BITRIX_AVAILABLE_ON_DECLINE) {
				initBitrixFormIfAllowed();
			}
			hide();
		});
	}

	function start() {
		var consent = getConsent();

		if (consent === 'accepted') {
			initAnalyticsIfAllowed();
			initBitrixFormIfAllowed();
			return;
		}

		if (consent === 'declined') {
			if (CONFIG.BITRIX_AVAILABLE_ON_DECLINE) {
				initBitrixFormIfAllowed();
			}
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
