/*
 * Cookie-consent баннер для es-trans.ru — ИТОГОВАЯ версия с гейтингом
 * Яндекс.Метрики И формы заявки Bitrix24.
 *
 * Это финальная сборка cookie-banner.js (../cookie-banner/cookie-banner.js)
 * с добавленным патчем Bitrix24 (см. README.md в этой папке) — готова к
 * вставке как есть в сборку Gulp вместо текущего js/cookie-banner.js.
 *
 * Подключение (перед </body>, ПОСЛЕ удаления старого <script id="cookieinfo">):
 *   <link rel="stylesheet" href="/css/cookie-banner.css">
 *   <script src="/js/cookie-banner.js" defer></script>
 *
 * Требования на стороне HTML:
 *   1) Метрику в <head> завернуть в window.__esTransInitMetrika (см.
 *      README.md в ../cookie-banner/) — сам этот файл её не трогает,
 *      только решает, когда вызвать.
 *   2) Инлайн-скрипт формы Bitrix24 в попапе #popup-form заменить на
 *      заглушку с id="b24-form-mount" (см. README.md в этой папке,
 *      Шаг 1) — сам этот файл вставляет loader_16.js программно.
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

	// Форма заявки Bitrix24 (data-b24-form) грузится отдельным скриптом с
	// cdn-ru.bitrix24.ru и сама решает, когда трекать свою аналитику — до
	// этого патча она стартовала сразу при загрузке страницы, до любого
	// выбора в cookie-баннере. Теперь скрипт вставляется только после
	// того, как пользователь нажал «Принимаю» или «Отказаться» (после
	// ЛЮБОГО выбора — форма нужна для приёма заявок, не только аналитики).
	// См. README.md в этой же папке — там же патч для HTML-заглушки на
	// месте формы (#b24-form-mount) и подключение loader_16.js.
	function initBitrixFormIfAllowed() {
		if (window.__esTransBitrixFormInited) return;
		window.__esTransBitrixFormInited = true;

		var mount = document.getElementById('b24-form-mount');
		if (!mount) return;

		mount.innerHTML = '';

		// ВАЖНО: скрипт вставляется ВНУТРЬ #b24-form-mount, а не рядом с
		// первым <script> на странице. С data-skip-moving="true" виджет
		// Bitrix24 рендерит себя рядом с самим тегом <script> — если
		// вставить его в <head> (как делает распространённый в интернете
		// сниппет с getElementsByTagName('script')[0]), форма отрисуется
		// в <head> и попап останется пустым. В оригинальном инлайн-варианте
		// это работало, потому что <script> физически лежал внутри
		// .popup__text — здесь тот же эффект достигается вставкой в mount.
		var s = document.createElement('script');
		s.async = true;
		s.setAttribute('data-b24-form', 'inline/16/nzutcg');
		s.setAttribute('data-skip-moving', 'true');
		s.src = 'https://cdn-ru.bitrix24.ru/b21839048/crm/form/loader_16.js?' + (Date.now() / 180000 | 0);
		mount.appendChild(s);
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
