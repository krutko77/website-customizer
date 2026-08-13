/*
 * Уведомление о переходе в мессенджер (Telegram / MAX) для es-trans.ru.
 *
 * При клике на ссылку, ведущую в Telegram (t.me/...) или MAX (max.ru/...),
 * переход блокируется и показывается модалка с текстом про обработку
 * персональных данных (та же формулировка, что в cookie-баннере) и
 * кнопкой «Перейти». Решение запоминается в localStorage ОТДЕЛЬНО для
 * каждого мессенджера — при повторном клике на ссылку того же мессенджера
 * модалка больше не показывается (согласие один раз, как в вариант 3,
 * согласованном с пользователем).
 *
 * Подключение (перед </body>, независимо от cookie-banner.js):
 *   <link rel="stylesheet" href="/css/messenger-consent.css">
 *   <script src="/js/messenger-consent.js" defer></script>
 *
 * Ничего в HTML менять не нужно — ссылки на мессенджеры перехватываются
 * по href-паттерну через делегирование на document, работает для любого
 * количества ссылок на любых страницах/блоках сайта.
 */
(function () {
	'use strict';

	var STORAGE_PREFIX = 'es-trans-messenger-consent-'; // + 'telegram' | 'max'
	var PRIVACY_URL = '/privacy-policy.html';
	var AGREEMENT_URL = '/agreement.html';

	// Правила определения мессенджера по href. Порядок важен, только если
	// домены пересекаются (здесь не пересекаются).
	var MESSENGERS = [
		{ id: 'telegram', name: 'Telegram', test: /(^|\/\/)(t\.me|telegram\.me)\//i },
		{ id: 'max', name: 'MAX', test: /(^|\/\/)max\.ru\//i }
	];

	function detectMessenger(href) {
		if (!href) return null;
		for (var i = 0; i < MESSENGERS.length; i++) {
			if (MESSENGERS[i].test.test(href)) return MESSENGERS[i];
		}
		return null;
	}

	function getConsent(id) {
		try {
			return localStorage.getItem(STORAGE_PREFIX + id);
		} catch (e) {
			return null;
		}
	}

	function setConsent(id) {
		try {
			localStorage.setItem(STORAGE_PREFIX + id, 'accepted');
		} catch (e) {
			/* localStorage недоступен — модалка будет показываться повторно,
			   это не критично */
		}
	}

	function makeLink(href, text) {
		var a = document.createElement('a');
		a.className = 'messenger-consent__link';
		a.href = href;
		a.target = '_blank';
		a.textContent = text;
		return a;
	}

	function buildModal(messenger, onConfirm) {
		var overlay = document.createElement('div');
		overlay.className = 'messenger-consent-overlay';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Переход в ' + messenger.name);

		var box = document.createElement('div');
		box.className = 'messenger-consent';

		// Собираем разметку через DOM-методы, а не innerHTML со строкой:
		// на сайте есть скрипт локализации, который постобрабатывает текстовые
		// узлы (data-lang) и ломается на innerHTML с двумя одинаковыми
		// `class="messenger-consent__link"` подряд — вторая ссылка уезжала в
		// текст как escaped-HTML вместо тега. DOM-методы это обходят.
		var text = document.createElement('p');
		text.className = 'messenger-consent__text';
		text.appendChild(document.createTextNode('Вы переходите в ' + messenger.name + '. Общаясь с нами в мессенджере, вы соглашаетесь с '));
		text.appendChild(makeLink(PRIVACY_URL, 'Политикой конфиденциальности'));
		text.appendChild(document.createTextNode(' и '));
		text.appendChild(makeLink(AGREEMENT_URL, 'Соглашением об обработке данных'));
		text.appendChild(document.createTextNode('.'));

		var actions = document.createElement('div');
		actions.className = 'messenger-consent__actions';

		var cancelBtn = document.createElement('button');
		cancelBtn.type = 'button';
		cancelBtn.className = 'messenger-consent__btn messenger-consent__btn--cancel';
		cancelBtn.textContent = 'Отмена';

		var confirmBtn = document.createElement('button');
		confirmBtn.type = 'button';
		confirmBtn.className = 'messenger-consent__btn messenger-consent__btn--confirm';
		confirmBtn.textContent = 'Перейти';

		actions.appendChild(cancelBtn);
		actions.appendChild(confirmBtn);
		box.appendChild(text);
		box.appendChild(actions);
		overlay.appendChild(box);

		function close() {
			overlay.classList.remove('messenger-consent-overlay--visible');
			overlay.addEventListener('transitionend', function onEnd() {
				overlay.removeEventListener('transitionend', onEnd);
				overlay.remove();
			});
			setTimeout(function () {
				if (overlay.parentNode) overlay.remove();
			}, 300);
		}

		cancelBtn.addEventListener('click', close);
		overlay.addEventListener('click', function (e) {
			if (e.target === overlay) close();
		});
		confirmBtn.addEventListener('click', function () {
			close();
			onConfirm();
		});

		document.addEventListener('keydown', function onEsc(e) {
			if (e.key === 'Escape') {
				document.removeEventListener('keydown', onEsc);
				close();
			}
		});

		return overlay;
	}

	function showModal(messenger, href, targetBlank) {
		var overlay = buildModal(messenger, function () {
			setConsent(messenger.id);
			if (targetBlank) {
				window.open(href, '_blank', 'noopener');
			} else {
				window.location.href = href;
			}
		});
		document.body.appendChild(overlay);
		requestAnimationFrame(function () {
			overlay.classList.add('messenger-consent-overlay--visible');
		});
	}

	document.addEventListener('click', function (e) {
		var link = e.target.closest ? e.target.closest('a[href]') : null;
		if (!link) return;

		var messenger = detectMessenger(link.getAttribute('href'));
		if (!messenger) return;

		if (getConsent(messenger.id) === 'accepted') return; // уже согласились раньше — пропускаем как обычную ссылку

		e.preventDefault();
		showModal(messenger, link.href, link.target === '_blank');
	});
})();
