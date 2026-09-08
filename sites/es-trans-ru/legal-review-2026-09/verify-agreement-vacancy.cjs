#!/usr/bin/env node
/**
 * Проверка Согласия соискателя на обработку персональных данных
 * (agreement-vacancy.html) на es-trans.ru.
 *
 *   node verify-agreement-vacancy.cjs                 # проверить прод
 *   node verify-agreement-vacancy.cjs --local          # проверить локальный файл
 *
 * Разделы и h1 сравниваются через textContent из DOM, а не через
 * document.body.innerText — на agreement.html выяснилось (проверка Патча
 * 3, 08.09.2026), что h3.soglashenie__title оформлен CSS
 * text-transform: uppercase, из-за чего innerText возвращает капс и ломает
 * прямое сравнение со строками в обычном регистре.
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

const EMAIL = 'policy@es-trans.ru';

const SECTION_TITLES = [
  '1. Цель обработки персональных данных',
  '2. Перечень персональных данных, на обработку которых дается согласие',
  '3. Перечень действий с персональными данными',
  '4. Способы обработки персональных данных',
  '5. Срок действия согласия',
  '6. Порядок отзыва согласия',
  '7. Подтверждение соискателя',
];

const PAGE_URL = LOCAL
  ? `file://${path.join(__dirname, 'agreement-vacancy.local.html')}`
  : 'https://es-trans.ru/agreement-vacancy.html';

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
  check(text.includes('141400'), 'Индекс/адрес оператора 141400');
  check(text.includes(EMAIL), `Почта ${EMAIL} (для отзыва согласия)`);

  // Все 7 разделов присутствуют — сравниваем textContent из DOM, не innerText
  const h3Texts = await page.evaluate(() =>
    [...document.querySelectorAll('h3.soglashenie__title')].map((el) =>
      el.textContent.replace(/\s+/g, ' ').trim()
    )
  );
  for (const title of SECTION_TITLES) {
    check(h3Texts.includes(title), `Раздел «${title}» присутствует`);
  }
  check(h3Texts.length === SECTION_TITLES.length, `Все ${SECTION_TITLES.length} разделов оформлены как <h3>`, `найдено ${h3Texts.length}`);

  // Заголовок: ровно один h1, сравниваем через textContent (не innerText)
  const h1 = await page.evaluate(() => {
    const el = document.querySelector('h1');
    return {
      count: document.querySelectorAll('h1').length,
      text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '',
    };
  });
  check(h1.count === 1, 'На странице ровно один <h1>', `найдено ${h1.count}`);
  check(
    /СОГЛАСИЕ соискателя/i.test(h1.text) && /на обработку персональных данных/.test(h1.text),
    '<h1> — заголовок Согласия соискателя на обработку ПДн',
    h1.text
  );

  // Специфика документа соискателя: цель — подбор персонала, а не заключение
  // гражданско-правового договора (как в agreement.html для контрагентов)
  check(text.includes('подбора персонала'), 'Цель обработки — подбор персонала (не как в agreement.html)');
  check(text.includes('сведения о трудовой деятельности'), 'В перечне ПДн есть сведения о трудовой деятельности');
  check(text.includes('сведения об образовании'), 'В перечне ПДн есть сведения об образовании');

  // В этом документе (в отличие от agreement.html) юристы не указали
  // раздела о третьих лицах — фиксируем, что он отсутствует, а не пропущен
  // по ошибке при переносе
  check(!text.includes('третьими лицами'), 'Раздела «третьи лица» нет (в тексте юристов не было)');

  // Списки — плоские <ul>/<li>, без составной нумерации <ol>
  const olCount = await page.evaluate(() => document.querySelectorAll('ol').length);
  check(olCount === 0, 'На странице нет <ol> (составная нумерация не используется)', `найдено ${olCount}`);

  if (LOCAL) {
    await browser.close();
    report();
    return;
  }

  // ---------- интеграция: подвал ----------
  // Решено владельцем 08.09.2026: ссылка на документ размещается в форме
  // отклика на вакансию, а не в общем подвале сайта (см. README) — поэтому
  // ссылку в подвале не проверяем как обязательную, только фиксируем в
  // отчёте. Проверка ссылки в самой форме — отдельная задача, когда форма
  // будет доработана и известен её URL/селектор.
  const footer = await page.evaluate(() => {
    const a = document.querySelector('a[href="/agreement-vacancy.html"].footer__link');
    return a ? { text: a.textContent.trim(), lang: a.getAttribute('data-lang') } : null;
  });
  console.log(
    footer
      ? `  ℹ В подвале есть ссылка на Согласие соискателя: «${footer.text}»`
      : '  ℹ В подвале нет ссылки на Согласие соискателя (ожидаемо — ссылка будет в форме вакансии, не в подвале)'
  );

  await browser.close();
  report();

  function report() {
    const pad = Math.max(...results.map((r) => r.label.length));
    let failed = 0;
    console.log(
      `\nПроверка Согласия соискателя на обработку ПДн: ${LOCAL ? 'локальный файл' : 'прод es-trans.ru'}\n`
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
