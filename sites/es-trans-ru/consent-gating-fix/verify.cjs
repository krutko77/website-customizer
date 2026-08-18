/*
 * Проверка патча consent-gating-fix на проде (es-trans.ru).
 *
 * Что проверяем — по трём состояниям согласия:
 *   без выбора / отказ  → ни карта, ни Битрикс не грузятся, cookie нет
 *   клик «Показать карту» → карта грузится, согласие в localStorage не меняется
 *   согласие            → карта и Метрика грузятся сразу
 *   открытие попапа     → Битрикс грузится (при любом выборе)
 *
 * Запуск:
 *   node verify.cjs                       # прод https://es-trans.ru
 *   node verify.cjs --base http://localhost:8099
 *
 * Расширение .cjs, а не .js — в package.json проекта стоит "type": "module".
 *
 * ВАЖНО про Метрику. Виджет Яндекс.Карты внутри своего iframe крутит
 * СОБСТВЕННЫЙ счётчик Яндекса (id 44120344, t:map frame). Это обработка
 * на стороне Яндекса, к счётчику сайта отношения не имеет. Поэтому
 * «Метрика не поднялась» проверяется по id счётчика сайта (111461082)
 * и по typeof window.ym в главном окне, а не по любому запросу
 * к mc.yandex.ru — иначе тест ложно падает.
 */
const path = require('path');
const { chromium } = require(path.resolve(
	__dirname,
	'../../../.claude/skills/playwright-skill/node_modules/playwright-core'
));

const argv = process.argv.slice(2);
const baseIdx = argv.indexOf('--base');
const BASE = baseIdx >= 0 ? argv[baseIdx + 1] : 'https://es-trans.ru';

const METRIKA_ID = '111461082';
let failures = 0;
let passes = 0;

function check(name, ok, detail) {
	if (ok) passes++; else failures++;
	console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

function classify(urls) {
	const ext = urls.filter(u => !u.startsWith(BASE) && !u.startsWith('data:'));
	return {
		ext,
		// виджет карты: yandex.ru/map-widget, yastatic и т.п., но не счётчик
		map: ext.filter(u => /yandex\.(ru|net)|yastatic/.test(u) && !/mc\.yandex\.ru/.test(u)),
		siteMetrika: ext.filter(u => u.includes(METRIKA_ID)),
		bitrix: ext.filter(u => /bitrix24/.test(u))
	};
}

async function open(browser, page, consent, lang) {
	const ctx = await browser.newContext();
	const p = await ctx.newPage();
	const reqs = [];
	p.on('request', r => reqs.push(r.url()));
	if (consent || lang) {
		await p.addInitScript(([c, l]) => {
			if (c) localStorage.setItem('es-trans-cookie-consent', c);
			if (l) localStorage.setItem('language', l);
		}, [consent, lang]);
	}
	await p.goto(`${BASE}/${page}`, { waitUntil: 'networkidle', timeout: 45000 });
	await p.waitForTimeout(800);
	return { ctx, p, reqs };
}

(async () => {
	console.log(`Проверка ${BASE}\n`);
	const browser = await chromium.launch();

	// --- 1. contacts.html без выбора --------------------------------------
	console.log('contacts.html — без выбора:');
	{
		const { ctx, p, reqs } = await open(browser, 'contacts.html');
		const c = classify(reqs);
		check('ноль внешних запросов', c.ext.length === 0, c.ext.slice(0, 3).join(', '));
		check('карта не загружена', c.map.length === 0, c.map[0]);
		check('нет ни одной cookie', (await ctx.cookies()).length === 0,
			(await ctx.cookies()).map(x => x.name).join(','));
		check('заглушка карты отрисована',
			await p.locator('.map-placeholder').count() === 1);
		check('iframe карты отсутствует',
			await p.locator('.contact__map iframe').count() === 0);
		check('баннер согласия показан',
			await p.locator('.cookie-banner').count() === 1);
		await ctx.close();
	}

	// --- 2. contacts.html при отказе --------------------------------------
	console.log('\ncontacts.html — отказ:');
	{
		const { ctx, p, reqs } = await open(browser, 'contacts.html', 'declined');
		const c = classify(reqs);
		check('ноль внешних запросов', c.ext.length === 0, c.ext.slice(0, 3).join(', '));
		const cookies = await ctx.cookies();
		check('нет cookie .yandex.ru', !cookies.some(x => x.domain.includes('yandex')),
			cookies.map(x => x.name).join(','));
		check('заглушка карты отрисована',
			await p.locator('.map-placeholder').count() === 1);
		check('баннер не показывается повторно',
			await p.locator('.cookie-banner').count() === 0);
		await ctx.close();
	}

	// --- 3. отказ + клик «Показать карту» ---------------------------------
	console.log('\ncontacts.html — отказ + клик «Показать карту»:');
	{
		const { ctx, p, reqs } = await open(browser, 'contacts.html', 'declined');
		await p.locator('.map-placeholder__btn').click();
		await p.waitForTimeout(3000);
		const c = classify(reqs);
		check('карта загрузилась', c.map.length > 0, `${c.map.length} запросов`);
		check('iframe вставлен', await p.locator('.contact__map iframe').count() === 1);
		check('заглушка убрана', await p.locator('.map-placeholder').count() === 0);
		check('Метрика сайта НЕ поднялась', c.siteMetrika.length === 0, c.siteMetrika[0]);
		check('window.ym не создан',
			await p.evaluate(() => typeof window.ym) === 'undefined');
		const stored = await p.evaluate(
			() => localStorage.getItem('es-trans-cookie-consent'));
		check('согласие не переписано (осталось declined)',
			stored === 'declined', String(stored));
		await ctx.close();
	}

	// --- 4. contacts.html при согласии ------------------------------------
	console.log('\ncontacts.html — согласие:');
	{
		const { ctx, p, reqs } = await open(browser, 'contacts.html', 'accepted');
		await p.waitForTimeout(2500);
		const c = classify(reqs);
		check('карта грузится сразу', c.map.length > 0, `${c.map.length} запросов`);
		check('Метрика сайта поднялась', c.siteMetrika.length > 0);
		check('заглушки нет', await p.locator('.map-placeholder').count() === 0);
		check('iframe вставлен', await p.locator('.contact__map iframe').count() === 1);
		await ctx.close();
	}

	// --- 5. принятие кнопкой в баннере, без перезагрузки ------------------
	console.log('\ncontacts.html — «Принимаю» в баннере:');
	{
		const { ctx, p, reqs } = await open(browser, 'contacts.html');
		await p.locator('.cookie-banner__btn--accept').click();
		await p.waitForTimeout(3000);
		const c = classify(reqs);
		check('карта подгрузилась без перезагрузки', c.map.length > 0);
		check('Метрика сайта поднялась', c.siteMetrika.length > 0);
		check('заглушка убрана', await p.locator('.map-placeholder').count() === 0);
		await ctx.close();
	}

	// --- 6. локализация заглушки ------------------------------------------
	console.log('\ncontacts.html — заглушка на трёх языках:');
	for (const [lang, expect] of [['ru', 'Показать карту'], ['en', 'Show map'], ['cn', '显示地图']]) {
		const { ctx, p } = await open(browser, 'contacts.html', 'declined', lang);
		// innerText приходит с учётом text-transform сайта — сравниваем без регистра
		const btn = (await p.locator('.map-placeholder__btn').innerText()).trim();
		check(`кнопка на ${lang}`, btn.toLowerCase() === expect.toLowerCase(), btn);
		const overflow = await p.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
		check(`нет горизонтального переполнения (${lang})`, !overflow);
		await ctx.close();
	}

	// --- 7. index.html: Битрикс не грузится до открытия формы -------------
	for (const consent of ['declined', 'accepted']) {
		console.log(`\nindex.html — ${consent}, попап не открыт:`);
		const { ctx, p, reqs } = await open(browser, 'index.html', consent);
		await p.waitForTimeout(2000);
		const c = classify(reqs);
		check('Битрикс не загружен', c.bitrix.length === 0, c.bitrix[0]);
		const cookies = await ctx.cookies();
		check('нет cookie b24_*', !cookies.some(x => x.name.startsWith('b24')),
			cookies.filter(x => x.name.startsWith('b24')).map(x => x.name).join(','));
		if (consent === 'accepted') {
			check('Метрика сайта поднялась', c.siteMetrika.length > 0);
		} else {
			check('Метрика сайта НЕ поднялась', c.siteMetrika.length === 0, c.siteMetrika[0]);
		}
		await ctx.close();
	}

	// --- 8. index.html: форма грузится при открытии попапа ----------------
	console.log('\nindex.html — отказ + открытие попапа с формой:');
	{
		const { ctx, p, reqs } = await open(browser, 'index.html', 'declined');
		await p.locator('[data-popup="#popup-form"]').first().click();
		await p.waitForTimeout(5000);
		const c = classify(reqs);
		check('Битрикс загрузился по открытию', c.bitrix.length > 0, `${c.bitrix.length} запросов`);
		const inputs = await p.locator('#b24-form-mount input, #b24-form-mount textarea').count();
		check('форма отрисована (есть поля ввода)', inputs > 0, `полей: ${inputs}`);
		check('надпись «Загружаем форму…» убрана',
			!(await p.locator('#b24-form-mount').innerHTML()).includes('Загружаем'));
		check('Метрика сайта по-прежнему не поднялась',
			c.siteMetrika.length === 0, c.siteMetrika[0]);
		await ctx.close();
	}

	// --- 9. остальные страницы не сломаны ---------------------------------
	console.log('\nостальные страницы — без ошибок в консоли, ноль внешних до выбора:');
	const others = ['about.html', 'services-transportation.html', 'services-customs.html',
		'vacancy-driver.html', 'vacancy-logistician.html', 'vacancy-sales-manager.html',
		'privacy-policy.html', 'agreement.html', 'contracts.html', 'thank-you-page.html'];
	for (const page of others) {
		const ctx = await browser.newContext();
		const p = await ctx.newPage();
		const errs = [];
		const reqs = [];
		p.on('pageerror', e => errs.push(e.message));
		p.on('request', r => reqs.push(r.url()));
		const resp = await p.goto(`${BASE}/${page}`, { waitUntil: 'networkidle', timeout: 45000 });
		await p.waitForTimeout(600);
		const c = classify(reqs);
		// Без этой проверки 404/листинг каталога дал бы ложный «зелёный»:
		// на пустой странице внешних запросов и ошибок тоже нет.
		const loaded = resp && resp.status() === 200 &&
			await p.locator('script[src*="app.min.js"]').count() > 0;
		check(`${page}: страница отдана и содержит app.min.js`, loaded,
			resp ? `HTTP ${resp.status()}` : 'нет ответа');
		check(`${page}: без JS-ошибок и внешних запросов`,
			errs.length === 0 && c.ext.length === 0,
			[errs[0], c.ext[0]].filter(Boolean).join(' | '));
		await ctx.close();
	}

	await browser.close();
	console.log(`\nИтог: ${passes} ок, ${failures} провалов`);
	process.exit(failures ? 1 : 0);
})().catch(e => {
	console.error('Ошибка выполнения:', e.message);
	process.exit(2);
});
