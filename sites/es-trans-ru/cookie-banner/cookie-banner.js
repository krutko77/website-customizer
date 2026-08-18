/*
 * Cookie-consent баннер для es-trans.ru — ЗЕРКАЛО ПРОДА
 *
 * ⚠️ ЭТО НЕ ПАТЧ ДЛЯ ВЫКЛАДКИ. Файл отражает то, что РЕАЛЬНО работает на
 * https://es-trans.ru сейчас — нужен как точка отсчёта при подготовке
 * следующих правок. Класть его в Gulp-проект бессмысленно: он совпадает с
 * тем, что уже собрано в js/app.min.js.
 *
 * Актуальный патч, ожидающий выкладки, — ../cookie-banner-i18n-fix/
 * (перевод баннера на en/cn). Именно оттуда брать файл для деплоя.
 *
 * Сверено с продом 2026-08-18 (app.min.js, last-modified 09:32 GMT).
 *
 * ИСТОРИЯ РАСХОЖДЕНИЯ: до 2026-08-18 этот файл отставал от прода — в нём
 * оставался insertBefore вместо mount.appendChild (баг: с
 * data-skip-moving="true" виджет Bitrix24 рендерит себя там, где физически
 * лежит его <script>, поэтому форма уходила в <head> и была невидима).
 * 2026-08-18 устаревшая версия по ошибке попала в сборку и уехала на прод —
 * форма заявок перестала отображаться, потребовался откат. Чтобы это не
 * повторилось, файл синхронизирован с продом и помечен как зеркало.
 *
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

	// Форма заявки Bitrix24 (data-b24-form) грузится отдельным скриптом с
	// cdn-ru.bitrix24.ru и сама решает, когда трекать свою аналитику — до
	// этого патча она стартовала сразу при загрузке страницы, до любого
	// выбора в cookie-баннере. Теперь скрипт вставляется только после
	// того, как пользователь нажал «Принимаю» или «Отказаться» (после
	// ЛЮБОГО выбора — форма нужна для приёма заявок, не только аналитики).
	// См. bitrix24-form/README.md — там же патч для HTML-заглушки на
	// месте формы (#b24-form-mount) и подключение loader_16.js.
	//
	// ⚠️ КРИТИЧНО: скрипт вставляется ВНУТРЬ #b24-form-mount через
	// mount.appendChild(s). С data-skip-moving="true" виджет Bitrix24
	// рендерит себя ровно там, где физически лежит его <script>. Если
	// вставить его через insertBefore рядом с первым <script> страницы
	// (обычно в <head>) — форма отрисуется в <head> и будет невидима, попап
	// заявки окажется пустым. Так уже ломалось дважды: 2026-08-12 и
	// 2026-08-18. НЕ МЕНЯТЬ на insertBefore.
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

	function buildBanner() {
		var banner = document.createElement('div');
		banner.className = 'cookie-banner';
		banner.setAttribute('role', 'dialog');
		banner.setAttribute('aria-live', 'polite');
		banner.setAttribute('aria-label', 'Уведомление об использовании файлов cookie');

		// data-lang проставлены для словаря сайта, НО перевод не работает:
		// функция je() в app.min.js отрабатывает один раз при загрузке
		// страницы, а баннер создаётся позже — поэтому на en/cn он остаётся
		// русским. Это чинит патч ../cookie-banner-i18n-fix/ (свой словарь
		// TRANSLATIONS + localStorage['language']).
		banner.innerHTML =
			'<div class="cookie-banner__inner">' +
				'<p class="cookie-banner__text">' +
					'<span data-lang="cookie-banner-1">Мы используем файлы cookie для работы сайта и аналитики.</span> ' +
					'<span data-lang="cookie-banner-2">Продолжая пользоваться сайтом, вы соглашаетесь с</span> ' +
					'<a class="cookie-banner__link" data-lang="cookie-banner-3" href="' + PRIVACY_URL + '">Политикой конфиденциальности</a> ' +
					'<span data-lang="cookie-banner-4">и</span> ' +
					'<a class="cookie-banner__link" data-lang="cookie-banner-5" href="' + AGREEMENT_URL + '">Согласием на обработку данных</a>.' +
				'</p>' +
				'<div class="cookie-banner__actions">' +
					'<button type="button" class="cookie-banner__btn cookie-banner__btn--decline" data-lang="cookie-banner-6">Отказаться</button>' +
					'<button type="button" class="cookie-banner__btn cookie-banner__btn--accept" data-lang="cookie-banner-7">Принимаю</button>' +
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
