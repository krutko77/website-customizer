const { chromium } = require('playwright');

// Проверка ЖИВОГО прода без подмен: патч уже выложен, глушить бандл нельзя.
const URL_ = 'https://es-trans.ru/contacts.html';
const YX = /yandex|yastatic/i;

let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log(`  ${cond ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`);
}

async function open(browser, lang) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  });
  const page = await ctx.newPage();
  await page.addInitScript((l) => { try { localStorage.setItem('language', l); } catch (e) {} }, lang);
  const reqs = [];
  page.on('request', (r) => { if (YX.test(r.url())) reqs.push(r.url()); });
  await page.goto(URL_, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  const banners = await page.evaluate(() => document.querySelectorAll('.cookie-banner').length);
  if (banners !== 1) throw new Error(`ожидался 1 баннер, на странице ${banners}`);
  return { ctx, page, reqs };
}

const snap = (page, ctx, reqs) => page.evaluate(() => ({
  iframe: !!document.querySelector('iframe[src*="yandex"]'),
  warning: (() => { const w = document.querySelector('.map-placeholder__warning'); return w ? w.textContent.trim() : null; })(),
  warnColor: (() => { const w = document.querySelector('.map-placeholder__warning'); return w ? getComputedStyle(w).color : null; })(),
  btn: (() => { const b = document.querySelector('.map-placeholder__btn'); return b ? b.textContent.trim() : null; })(),
  mapConsent: (() => { try { return sessionStorage.getItem('es-trans-map-consent'); } catch (e) { return 'n/a'; } })(),
  cookieConsent: (() => { try { return localStorage.getItem('es-trans-cookie-consent'); } catch (e) { return 'n/a'; } })(),
})).then(async (s) => ({ ...s, yandex: reqs.length, cookies: (await ctx.cookies()).length }));

(async () => {
  const browser = await chromium.launch({ headless: true });

  { // Т1 — до выбора
    const { ctx, page, reqs } = await open(browser, 'ru');
    await page.waitForTimeout(2500);
    const s = await snap(page, ctx, reqs);
    console.log('\n=== Т1. До выбора в баннере ===');
    check('0 запросов к Яндексу', s.yandex === 0, `было ${s.yandex}`);
    check('0 cookie', s.cookies === 0, `было ${s.cookies}`);
    check('iframe не создан', !s.iframe);
    check('предупреждения нет (выбор не сделан)', s.warning === null);
    await ctx.close();
  }

  { // Т2 — отказ без клика
    const { ctx, page, reqs } = await open(browser, 'ru');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--decline').click());
    await page.waitForTimeout(4000);
    const s = await snap(page, ctx, reqs);
    console.log('\n=== Т2. Отказ, «Показать карту» не жали ===');
    check('0 запросов к Яндексу', s.yandex === 0, `было ${s.yandex}`);
    check('0 cookie', s.cookies === 0, `было ${s.cookies}`);
    check('iframe не создан', !s.iframe);
    check('предупреждение показано', !!s.warning, s.warning ? s.warning.slice(0, 55) : 'нет');
    check('предупреждение красное', s.warnColor === 'rgb(220, 32, 37)', String(s.warnColor));
    check('разового согласия нет', s.mapConsent === null, String(s.mapConsent));
    await ctx.close();
  }

  { // Т3 — отказ + осознанный клик
    const { ctx, page, reqs } = await open(browser, 'ru');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--decline').click());
    await page.waitForTimeout(2000);
    const before = reqs.length;
    await page.evaluate(() => document.querySelector('.map-placeholder__btn').click());
    await page.waitForTimeout(6000);
    const s = await snap(page, ctx, reqs);
    console.log('\n=== Т3. Отказ + осознанный клик «Показать карту» ===');
    check('до клика запросов не было', before === 0, `было ${before}`);
    check('карта загрузилась', s.iframe);
    check('разовое согласие зафиксировано', s.mapConsent === 'granted', String(s.mapConsent));
    check('общий отказ НЕ переписан', s.cookieConsent === 'declined', String(s.cookieConsent));
    await ctx.close();
  }

  { // Т4 — принимаю
    const { ctx, page, reqs } = await open(browser, 'ru');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--accept').click());
    await page.waitForTimeout(6000);
    const s = await snap(page, ctx, reqs);
    console.log('\n=== Т4. Принимаю ===');
    check('карта загрузилась', s.iframe);
    check('согласие accepted', s.cookieConsent === 'accepted', String(s.cookieConsent));
    check('разовый ключ не ставился', s.mapConsent === null, String(s.mapConsent));
    await ctx.close();
  }

  { // Т5 — перезагрузка после разового согласия
    const { ctx, page, reqs } = await open(browser, 'ru');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--decline').click());
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('.map-placeholder__btn').click());
    await page.waitForTimeout(4000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const s = await snap(page, ctx, reqs);
    console.log('\n=== Т5. Перезагрузка в той же вкладке после разового согласия ===');
    check('карта осталась (sessionStorage жив)', s.iframe);
    check('общий отказ сохранён', s.cookieConsent === 'declined', String(s.cookieConsent));
    await ctx.close();
  }

  { // Т6 — локализация
    const { ctx, page, reqs } = await open(browser, 'en');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--decline').click());
    await page.waitForTimeout(3000);
    const s = await snap(page, ctx, reqs);
    console.log('\n=== Т6. Локализация предупреждения (en) ===');
    check('предупреждение на английском', !!s.warning && /You have declined/i.test(s.warning), s.warning ? s.warning.slice(0, 55) : 'нет');
    check('кнопка на английском', s.btn === 'Show map', String(s.btn));
    await page.screenshot({ path: '/tmp/prod-map-warning-en.png' });
    await ctx.close();
  }

  console.log(`\n========== ${fails === 0 ? '✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '❌ ПРОВАЛОВ: ' + fails} ==========`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
