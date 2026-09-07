#!/usr/bin/env node
/**
 * Проверка новой редакции Согласия на обработку персональных данных
 * (agreement.html) на es-trans.ru.
 *
 *   node verify-agreement.cjs                 # проверить прод
 *   node verify-agreement.cjs --local          # проверить локальный agreement.html
 *
 * Реквизиты (индекс, email) приведены к прод-значениям 141400 /
 * policy@es-trans.ru по тому же решению владельца, что и для Политики
 * обработки ПДн (Патч 2, см. README) — присланный юристами текст
 * содержал 141590 / info@es-trans.pro.
 *
 * В отличие от Патча 2, здесь третьи лица названы поимённо с ИНН — так
 * пришли в присланном тексте юристов (раздел 5), проверяем их наличие.
 *
 * Расширение .cjs, а не .js — в package.json проекта стоит "type": "module".
 */

const path = require('path');
const PW = path.join(
  __dirname,
  '../../../.claude/skills/playwright-skill/node_modules/playwright-core'
);
const { chromium } = require(PW);

const argv = process.argv.slice(2);
const LOCAL = argv.includes('--local');

const ZIP = '141400';
const WRONG_ZIP = '141590';
const EMAIL = 'policy@es-trans.ru';
const WRONG_EMAIL = 'info@es-trans.pro';

const OLD_EDITION_MARKERS = [
  'Год, месяц, дата и место рождения',
  'Информация об ИНН (об идентификационном номере',
  'ИНН 7810353960, 196006,', // старая формулировка реквизитов ТаймВэб (без ОГРН)
  'обезличенных данных о посетителях с помощью сервиса интернет-статистики',
];

const SECTION_TITLES = [
  '1. Цель обработки персональных данных',
  '2. Перечень персональных данных',
  '3. Перечень действий с персональными данными',
  '4. Способы обработки персональных данных',
  '5. Обработка персональных данных третьими лицами',
  '6. Срок действия согласия',
  '7. Порядок отзыва согласия',
  '8. Подтверждение Пользователя',
];

const THIRD_PARTIES = [
  { name: 'ООО «1С-Битрикс»', inn: '7717586110' },
  { name: 'АО «ПФ «СКБ Контур»', inn: '6663003127' },
  { name: 'ООО «ЯНДЕКС»', inn: '7736207543' },
  { name: 'АО «ТаймВэб»', inn: '7810353960' },
];

const PAGE_URL = LOCAL
  ? `file://${path.join(__dirname, 'agreement.local.html')}`
  : 'https://es-trans.ru/agreement.html';

const results = [];
const check = (ok, label, detail = '') => results.push({ ok, label, detail });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();

  const resp = await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  if (!LOCAL) {
    check(resp && resp.status() === 200, 'Страница отдаёт 200', resp ? `HTTP ${resp.status()}` : 'нет ответа');
  }

  const text = await page.evaluate(() => document.body.innerText);

  // Реквизиты оператора
  check(text.includes('5047078788'), 'ИНН оператора 5047078788');
  check(text.includes('1065047062574'), 'ОГРН оператора 1065047062574');
  check(
    text.includes(ZIP) && !text.includes(WRONG_ZIP),
    `Индекс ${ZIP} (не ${WRONG_ZIP} из письма юристов)`
  );
  check(
    text.includes(EMAIL) && !text.includes(WRONG_EMAIL),
    `Почта ${EMAIL} (не ${WRONG_EMAIL} из письма юристов)`
  );

  // Все 8 разделов присутствуют
  for (const title of SECTION_TITLES) {
    check(text.includes(title), `Раздел «${title}» присутствует`);
  }

  // Третьи лица названы поимённо с ИНН
  for (const p of THIRD_PARTIES) {
    check(text.includes(p.name), `Третье лицо «${p.name}» названо`);
    check(text.includes(p.inn), `ИНН ${p.inn} (${p.name}) присутствует`);
  }

  // Ничего не осталось от старой редакции (общее согласие всех посетителей сайта)
  for (const marker of OLD_EDITION_MARKERS) {
    check(!text.includes(marker), `Нет текста старой редакции: «${marker}»`);
  }

  // Заголовок: ровно один h1
  const h1 = await page.evaluate(() => {
    const els = [...document.querySelectorAll('h1')];
    return {
      count: els.length,
      textOk: els[0] ? /Согласие/.test(els[0].textContent) && /на обработку персональных данных/.test(els[0].textContent) : false,
    };
  });
  check(h1.count === 1, 'На странице ровно один <h1>', `найдено ${h1.count}`);
  check(h1.textOk, '<h1> — заголовок Согласия на обработку ПДн');

  // Разделы оформлены заголовками h3, а не жирным текстом внутри абзаца
  const h3Count = await page.evaluate(
    () => document.querySelectorAll('h3.soglashenie__title').length
  );
  check(h3Count === SECTION_TITLES.length, `Все ${SECTION_TITLES.length} разделов оформлены как <h3>`, `найдено ${h3Count}`);

  // Списки — плоские <ul>/<li>, без составной нумерации <ol>
  const olCount = await page.evaluate(() => document.querySelectorAll('ol').length);
  check(olCount === 0, 'На странице нет <ol> (составная нумерация не используется)', `найдено ${olCount}`);

  if (LOCAL) {
    await browser.close();
    report();
    return;
  }

  // ---------- интеграция: подвал ----------
  const footer = await page.evaluate(() => {
    const a = document.querySelector('a[href="/agreement.html"].footer__link');
    return a ? { text: a.textContent.trim(), lang: a.getAttribute('data-lang') } : null;
  });
  check(footer !== null, 'В подвале есть ссылка на Согласие на обработку данных');

  await browser.close();
  report();

  function report() {
    const pad = Math.max(...results.map((r) => r.label.length));
    let failed = 0;
    console.log(
      `\nПроверка Согласия на обработку ПДн: ${LOCAL ? 'локальный файл' : 'прод es-trans.ru'}\n`
    );
    for (const r of results) {
      if (!r.ok) failed++;
      const mark = r.ok ? '✓' : '✗';
      const detail = r.detail ? `  (${r.detail})` : '';
      console.log(`  ${mark} ${r.label.padEnd(pad)}${detail}`);
    }
    const total = results.length;
    console.log(
      `\n${total - failed}/${total} пройдено${failed ? ` — ПРОВАЛЕНО: ${failed}` : ''}\n`
    );
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => {
  console.error('Ошибка выполнения:', e.message);
  process.exit(2);
});
