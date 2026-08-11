/*
 * Cookie-consent баннер для es-trans.ru
 * Заменяет сторонний cookieinfoscript.com — добавляет реальную блокировку
 * Яндекс.Метрики (ym init) до получения согласия пользователя.
 *
 * Подключение (перед </body>, ПОСЛЕ удаления старого <script id="cookieinfo">):
 *   <link rel="stylesheet" href="/css/cookie-banner.css">
 *   <script src="/js/cookie-banner.js" defer></script>
 *
 * Метрику в <head> нужно завернуть в window.__esTransInitMetrika (см. README.md
 * в этой же папке) — сам этот файл её не трогает, только решает, когда вызвать.
 */
(function () {
	'use strict';

	var STORAGE_KEY = 'es-trans-cookie-consent'; // 'accepted' | 'declined'
	var PRIVACY_URL = '/privacy-policy.html';
	var AGREEMENT_URL = '/agreement.html';

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

	function buildBanner() {
		var banner = document.createElement('div');
		banner.className = 'cookie-banner';
		banner.setAttribute('role', 'dialog');
		banner.setAttribute('aria-live', 'polite');
		banner.setAttribute('aria-label', 'Уведомление об использовании файлов cookie');

		banner.innerHTML =
			'<div class="cookie-banner__inner">' +
				'<p class="cookie-banner__text">' +
					'Мы используем файлы cookie для работы сайта и аналитики. ' +
					'Продолжая пользоваться сайтом, вы соглашаетесь с ' +
					'<a class="cookie-banner__link" href="' + PRIVACY_URL + '">Политикой конфиденциальности</a> ' +
					'и <a class="cookie-banner__link" href="' + AGREEMENT_URL + '">Соглашением об обработке данных</a>.' +
				'</p>' +
				'<div class="cookie-banner__actions">' +
					'<button type="button" class="cookie-banner__btn cookie-banner__btn--decline">Отказаться</button>' +
					'<button type="button" class="cookie-banner__btn cookie-banner__btn--accept">Принимаю</button>' +
				'</div>' +
			'</div>';

		return banner;
	}

	function showBanner() {
		var banner = buildBanner();
		document.body.appendChild(banner);

		// небольшая задержка перед анимацией появления
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
			hide();
		});

		banner.querySelector('.cookie-banner__btn--decline').addEventListener('click', function () {
			setConsent('declined');
			hide();
		});
	}

	function start() {
		var consent = getConsent();

		if (consent === 'accepted') {
			initMetrikaIfAllowed();
			return;
		}

		if (consent === 'declined') {
			return; // пользователь уже отказался — баннер повторно не показываем
		}

		showBanner();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
