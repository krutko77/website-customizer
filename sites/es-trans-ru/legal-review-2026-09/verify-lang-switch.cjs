// Тест на баг «смена языка в шапке не переводит cookie-баннер и заглушку карты».
// Гоняется на локальной сборке (build-local.py), а не на проде: нужно проверить
// ИСПРАВЛЕННЫЙ файл до выкладки.
//
// Запуск:  node test-lang-switch.cjs <url-главной> <url-контактов>
const { chromium } = require('/home/my_workspace/website-customizer/.claude/skills/playwright-skill/node_modules/playwright');

const HOME = process.argv[2];
const CONTACTS = process.argv[3];

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) console.log(`      ожидалось: ${JSON.stringify(expected)}\n      получено : ${JSON.stringify(actual)}`);
}
function checkNot(name, actual, forbidden) {
  const ok = actual !== forbidden;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) console.log(`      не должно было остаться: ${JSON.stringify(forbidden)}`);
}

// Эталонные строки из словаря TRANSLATIONS (по одной на язык).
// Значения выписаны ИЗ словаря TRANSLATIONS в cookie-banner.js, а не по
// памяти: первый прогон теста разошёлся с кодом в трёх местах
// («Decline» vs «Refuse», «Cookie Policy» vs «the Cookie Policy»,
// «同意» vs «我同意») — ошибка была в тесте.
const EXPECT = {
  ru: { accept: 'Согласен', decline: 'Отказаться', link: 'Политикой использования файлов cookie' },
  en: { accept: 'I agree', decline: 'Refuse', link: 'the Cookie Policy' },
  cn: { accept: '我同意', decline: '拒绝', link: 'Cookie 使用政策' },
};

const readBanner = (page) => page.evaluate(() => {
  const b = document.querySelector('.cookie-banner');
  if (!b) return null;
  return {
    text: b.querySelector('.cookie-banner__text')?.textContent.trim(),
    accept: b.querySelector('.cookie-banner__btn--accept')?.textContent.trim(),
    decline: b.querySelector('.cookie-banner__btn--decline')?.textContent.trim(),
    link: b.querySelector('.cookie-banner__link')?.textContent.trim(),
    links: b.querySelectorAll('.cookie-banner__link').length,
  };
});

const readMap = (page) => page.evaluate(() => {
  const box = document.querySelector('.map-placeholder');
  if (!box) return null;
  return {
    note: box.querySelector('.map-placeholder__text')?.textContent.trim(),
    btn: box.querySelector('.map-placeholder__btn')?.textContent.trim(),
    warning: box.querySelector('.map-placeholder__warning')?.textContent.trim() || null,
  };
});

(async () => {
  const browser = await chromium.launch();

  // --- 1. Баннер: переключение языка на лету -----------------------------
  console.log('\n--- Баннер: переключение языка после загрузки ---');
  const ctx = await browser.newContext({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cookie-banner', { timeout: 10000 });

  const ru = await readBanner(page);
  check('ru: кнопка «Согласен»', ru.accept, EXPECT.ru.accept);
  check('ru: ссылка на Политику cookie', ru.link, EXPECT.ru.link);
  check('ru: ссылка ровно одна', ru.links, 1);

  await page.selectOption('#languageSelect', 'en');
  await page.waitForTimeout(400);
  const en = await readBanner(page);
  check('en: кнопка переведена', en.accept, EXPECT.en.accept);
  check('en: кнопка отказа переведена', en.decline, EXPECT.en.decline);
  check('en: ссылка переведена', en.link, EXPECT.en.link);
  checkNot('en: текст больше не русский', en.text, ru.text);
  check('en: ссылка по-прежнему одна', en.links, 1);

  await page.selectOption('#languageSelect', 'cn');
  await page.waitForTimeout(400);
  const cn = await readBanner(page);
  check('cn: кнопка переведена', cn.accept, EXPECT.cn.accept);
  check('cn: ссылка переведена', cn.link, EXPECT.cn.link);

  // Возврат на русский
  await page.selectOption('#languageSelect', 'ru');
  await page.waitForTimeout(400);
  const back = await readBanner(page);
  check('возврат на ru: текст совпадает с исходным', back.text, ru.text);
  check('возврат на ru: ссылка одна (нет дублей после перерисовок)', back.links, 1);

  // --- 2. Кнопки после перерисовки остаются рабочими ---------------------
  console.log('\n--- Баннер: работоспособность после смены языка ---');
  await page.selectOption('#languageSelect', 'en');
  await page.waitForTimeout(400);
  await page.click('.cookie-banner__btn--decline');
  await page.waitForTimeout(600);
  const consent = await page.evaluate(() => localStorage.getItem('es-trans-cookie-consent'));
  check('клик по «Decline» после смены языка сохраняет выбор', consent, 'declined');
  const gone = await page.evaluate(() => !document.querySelector('.cookie-banner--visible'));
  check('баннер скрылся после клика', gone, true);
  await ctx.close();

  // --- 3. Заглушка карты: переключение языка на лету ---------------------
  console.log('\n--- Заглушка карты: переключение языка ---');
  const ctx2 = await browser.newContext({ locale: 'ru-RU' });
  const p2 = await ctx2.newPage();
  await p2.goto(CONTACTS, { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('.map-placeholder', { timeout: 10000 });

  const mru = await readMap(p2);
  await p2.selectOption('#languageSelect', 'en');
  await p2.waitForTimeout(400);
  const men = await readMap(p2);
  checkNot('карта en: текст заглушки переведён', men.note, mru.note);
  checkNot('карта en: кнопка «Показать карту» переведена', men.btn, mru.btn);

  // Отказ -> появляется предупреждение, оно тоже должно переводиться
  await p2.click('.cookie-banner__btn--decline');
  await p2.waitForTimeout(600);
  const mdecl = await readMap(p2);
  check('карта: предупреждение появилось при отказе', typeof mdecl.warning === 'string' && mdecl.warning.length > 0, true);

  await p2.selectOption('#languageSelect', 'cn');
  await p2.waitForTimeout(400);
  const mcn = await readMap(p2);
  checkNot('карта cn: предупреждение переведено', mcn.warning, mdecl.warning);
  check('карта cn: предупреждение не исчезло', typeof mcn.warning === 'string' && mcn.warning.length > 0, true);

  // Кнопка после перерисовок всё ещё грузит карту
  await p2.click('.map-placeholder__btn');
  await p2.waitForTimeout(1500);
  const loaded = await p2.evaluate(() => !!document.querySelector('[data-map-src] iframe'));
  check('карта грузится по кнопке после смены языка (обработчик жив)', loaded, true);

  await browser.close();

  console.log(`\n${'='.repeat(46)}\nИТОГО: ${pass} ✅   ${fail} ❌`);
  process.exit(fail === 0 ? 0 : 1);
})();
