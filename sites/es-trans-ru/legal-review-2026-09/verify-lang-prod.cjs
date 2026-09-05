// Проверка фикса локализации на живом проде es-trans.ru после выкладки 05.09
// (второй деплой, bundle last-modified 13:13:22 GMT).
const { chromium } = require('/home/my_workspace/website-customizer/.claude/skills/playwright-skill/node_modules/playwright');

const HOME = 'https://es-trans.ru/';
const CONTACTS = 'https://es-trans.ru/contacts.html';

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

// Значения из словаря TRANSLATIONS в cookie-banner.js (сверено 05.09).
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

  console.log('--- Баннер (главная): переключение языка после загрузки ---');
  const ctx = await browser.newContext({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cookie-banner', { timeout: 15000 });

  const ru = await readBanner(page);
  check('ru: кнопка «Согласен»', ru.accept, EXPECT.ru.accept);
  check('ru: ссылка на Политику cookie', ru.link, EXPECT.ru.link);
  check('ru: ссылка ровно одна', ru.links, 1);

  await page.selectOption('#languageSelect', 'en');
  await page.waitForTimeout(600);
  const en = await readBanner(page);
  check('en: кнопка переведена', en.accept, EXPECT.en.accept);
  check('en: кнопка отказа переведена', en.decline, EXPECT.en.decline);
  check('en: ссылка переведена', en.link, EXPECT.en.link);
  checkNot('en: текст больше не русский', en.text, ru.text);
  check('en: ссылка по-прежнему одна', en.links, 1);

  await page.selectOption('#languageSelect', 'cn');
  await page.waitForTimeout(600);
  const cn = await readBanner(page);
  check('cn: кнопка переведена', cn.accept, EXPECT.cn.accept);
  check('cn: ссылка переведена', cn.link, EXPECT.cn.link);

  await page.selectOption('#languageSelect', 'ru');
  await page.waitForTimeout(600);
  const back = await readBanner(page);
  check('возврат на ru: текст совпадает с исходным', back.text, ru.text);
  check('возврат на ru: ссылка одна (нет дублей после перерисовок)', back.links, 1);

  console.log('\n--- Баннер: работоспособность после смены языка ---');
  await page.selectOption('#languageSelect', 'en');
  await page.waitForTimeout(400);
  await page.click('.cookie-banner__btn--decline');
  await page.waitForTimeout(700);
  const consent = await page.evaluate(() => localStorage.getItem('es-trans-cookie-consent'));
  check('клик по «Refuse» после смены языка сохраняет выбор', consent, 'declined');
  const gone = await page.evaluate(() => !document.querySelector('.cookie-banner--visible'));
  check('баннер скрылся после клика', gone, true);
  await ctx.close();

  console.log('\n--- Заглушка карты (contacts.html): переключение языка ---');
  const ctx2 = await browser.newContext({ locale: 'ru-RU' });
  const p2 = await ctx2.newPage();
  await p2.goto(CONTACTS, { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('.map-placeholder', { timeout: 15000 });

  const mru = await readMap(p2);
  await p2.selectOption('#languageSelect', 'en');
  await p2.waitForTimeout(600);
  const men = await readMap(p2);
  checkNot('карта en: текст заглушки переведён', men.note, mru.note);
  checkNot('карта en: кнопка «Показать карту» переведена', men.btn, mru.btn);

  await p2.click('.cookie-banner__btn--decline');
  await p2.waitForTimeout(700);
  const mdecl = await readMap(p2);
  check('карта: предупреждение появилось при отказе (на EN)', typeof mdecl.warning === 'string' && mdecl.warning.length > 0, true);

  await p2.selectOption('#languageSelect', 'cn');
  await p2.waitForTimeout(600);
  const mcn = await readMap(p2);
  checkNot('карта cn: предупреждение переведено (была смесь языков)', mcn.warning, mdecl.warning);
  check('карта cn: предупреждение не исчезло', typeof mcn.warning === 'string' && mcn.warning.length > 0, true);
  const footer1cn = await p2.evaluate(() => document.querySelector('[data-lang=footer-menu-1]')?.textContent.trim());
  console.log(`   контроль (подвал cn): ${footer1cn}`);

  await p2.selectOption('#languageSelect', 'ru');
  await p2.waitForTimeout(600);

  const loaded1 = await p2.evaluate(() => !!document.querySelector('[data-map-src] iframe'));
  check('до клика: карта ещё НЕ загружена (гейтинг цел)', loaded1, false);

  await p2.click('.map-placeholder__btn');
  await p2.waitForTimeout(2000);
  const loaded = await p2.evaluate(() => !!document.querySelector('[data-map-src] iframe'));
  check('карта грузится по кнопке после смены языка (обработчик жив)', loaded, true);

  const stillDeclined = await p2.evaluate(() => localStorage.getItem('es-trans-cookie-consent'));
  check('общий отказ не переписан разовым показом карты', stillDeclined, 'declined');

  await browser.close();

  console.log(`\n${'='.repeat(46)}\nИТОГО: ${pass} ✅   ${fail} ❌`);
  process.exit(fail === 0 ? 0 : 1);
})();
