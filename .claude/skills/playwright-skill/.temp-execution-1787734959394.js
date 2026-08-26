const { chromium } = require('playwright');
const fs = require('fs');

const path = require('path');

// Проверяет ПАТЧ против живой страницы: прод-бандл глушится, вместо него
// грузится cookie-banner.js из этой папки. Запуск:
//   node verify-map-consent.cjs
//   PATCH_DIR=/путь/к/map-consent-fix node verify-map-consent.cjs
//
// __dirname не используем: run.js из playwright-skill копирует скрипт во
// временный файл в своей директории, и __dirname указывает туда, а не сюда.
const PATCH_DIR = process.env.PATCH_DIR ||
  (fs.existsSync(path.join(__dirname, 'cookie-banner.js'))
    ? __dirname
    : '/home/my_workspace/website-customizer/sites/es-trans-ru/map-consent-fix');

const TARGET_URL = process.env.TARGET_URL || 'https://es-trans.ru/contacts.html';
const PATCHED = fs.readFileSync(path.join(PATCH_DIR, 'cookie-banner.js'), 'utf8');
const PATCHED_CSS = fs.readFileSync(path.join(PATCH_DIR, 'map-placeholder.css'), 'utf8');
const YX = /yandex|yastatic/i;

// Прод отдаёт баннер внутри app.min.js. Чтобы проверить ПАТЧ, а не прод,
// вырезаем баннерную IIFE из бандла и подставляем наш файл отдельным скриптом.
async function makePage(browser, lang) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  });
  const page = await ctx.newPage();

  // Прод-баннер живёт внутри app.min.js и рисует ВТОРОЙ баннер поверх нашего,
  // из-за чего querySelector попадает в прод-версию, а не в проверяемый патч.
  // Глушим бандл целиком: гейтинг карты обеспечивает именно cookie-banner.js,
  // остальной бандл (слайдеры, попапы) для этих проверок не нужен.
  await page.route('**/js/app.min.js*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed for test */' })
  );

  await page.addInitScript((l) => {
    try { localStorage.setItem('language', l); } catch (e) {}
  }, lang);

  const reqs = [];
  page.on('request', (r) => { if (YX.test(r.url())) reqs.push(r.url()); });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.addStyleTag({ content: PATCHED_CSS });
  await page.addScriptTag({ content: PATCHED });
  await page.waitForTimeout(1200);

  // Страховка стенда: если баннеров не ровно один, все замеры ниже
  // относятся не к патчу — лучше упасть громко, чем намерить ложное «ок».
  const banners = await page.evaluate(() => document.querySelectorAll('.cookie-banner').length);
  if (banners !== 1) throw new Error(`ожидался 1 баннер, на странице ${banners}`);

  return { ctx, page, reqs };
}

async function state(page, ctx, reqs) {
  const s = await page.evaluate(() => {
    const holder = document.querySelector('[data-map-src]');
    const f = document.querySelector('iframe[src*="yandex"]');
    const warn = document.querySelector('.map-placeholder__warning');
    return {
      iframe: !!f,
      warning: warn ? warn.textContent.trim().slice(0, 60) : null,
      btn: (() => { const b = document.querySelector('.map-placeholder__btn'); return b ? b.textContent.trim() : null; })(),
      mapConsent: (() => { try { return sessionStorage.getItem('es-trans-map-consent'); } catch (e) { return 'n/a'; } })(),
      cookieConsent: (() => { try { return localStorage.getItem('es-trans-cookie-consent'); } catch (e) { return 'n/a'; } })(),
    };
  });
  const cookies = await ctx.cookies();
  return { ...s, yandex: reqs.length, cookies: cookies.length };
}

const ok = (b) => (b ? '✅' : '❌');
let fails = 0;
function check(label, cond, detail) {
  if (!cond) fails++;
  console.log(`  ${ok(cond)} ${label}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // --- Т1: отказ, карту не трогаем ---
  {
    const { ctx, page, reqs } = await makePage(browser, 'ru');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--decline').click());
    await page.waitForTimeout(3000);
    const s = await state(page, ctx, reqs);
    console.log('\n=== Т1. Отказ, «Показать карту» не жали ===');
    check('0 запросов к Яндексу', s.yandex === 0, `было ${s.yandex}`);
    check('0 cookie', s.cookies === 0, `было ${s.cookies}`);
    check('iframe не создан', !s.iframe);
    check('предупреждение показано', !!s.warning, s.warning || 'нет');
    check('разового согласия нет', s.mapConsent === null, String(s.mapConsent));
    await ctx.close();
  }

  // --- Т2: отказ + клик «Показать карту» ---
  {
    const { ctx, page, reqs } = await makePage(browser, 'ru');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--decline').click());
    await page.waitForTimeout(2000);
    const before = reqs.length;
    await page.evaluate(() => document.querySelector('.map-placeholder__btn').click());
    await page.waitForTimeout(5000);
    const s = await state(page, ctx, reqs);
    console.log('\n=== Т2. Отказ + осознанный клик «Показать карту» ===');
    check('до клика запросов не было', before === 0, `было ${before}`);
    check('карта загрузилась', s.iframe);
    check('разовое согласие зафиксировано', s.mapConsent === 'granted', String(s.mapConsent));
    check('общий отказ НЕ переписан', s.cookieConsent === 'declined', String(s.cookieConsent));
    await ctx.close();
  }

  // --- Т3: до выбора ---
  {
    const { ctx, page, reqs } = await makePage(browser, 'ru');
    await page.waitForTimeout(2500);
    const s = await state(page, ctx, reqs);
    console.log('\n=== Т3. До выбора в баннере ===');
    check('0 запросов к Яндексу', s.yandex === 0, `было ${s.yandex}`);
    check('iframe не создан', !s.iframe);
    check('предупреждения НЕТ (выбор не сделан)', s.warning === null, s.warning || 'нет');
    await ctx.close();
  }

  // --- Т4: принимаю ---
  {
    const { ctx, page, reqs } = await makePage(browser, 'ru');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--accept').click());
    await page.waitForTimeout(5000);
    const s = await state(page, ctx, reqs);
    console.log('\n=== Т4. Принимаю ===');
    check('карта загрузилась', s.iframe);
    check('согласие accepted', s.cookieConsent === 'accepted', String(s.cookieConsent));
    check('разовый ключ не ставился (не нужен)', s.mapConsent === null, String(s.mapConsent));
    await ctx.close();
  }

  // --- Т5: локализация предупреждения (en) ---
  {
    const { ctx, page, reqs } = await makePage(browser, 'en');
    await page.evaluate(() => document.querySelector('.cookie-banner__btn--decline').click());
    await page.waitForTimeout(2500);
    const s = await state(page, ctx, reqs);
    console.log('\n=== Т5. Локализация предупреждения (en) ===');
    check('предупреждение на английском', !!s.warning && /You have declined/i.test(s.warning), s.warning || 'нет');
    check('кнопка на английском', s.btn === 'Show map', String(s.btn));
    await page.screenshot({ path: '/tmp/map-warning-en.png' });
    await ctx.close();
  }

  console.log(`\n========== ${fails === 0 ? '✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : '❌ ПРОВАЛОВ: ' + fails} ==========`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
