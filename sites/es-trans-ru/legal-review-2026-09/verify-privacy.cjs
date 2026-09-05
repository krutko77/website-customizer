#!/usr/bin/env node
/**
 * Проверка новой редакции Политики обработки персональных данных
 * (privacy-policy.html) на es-trans.ru.
 *
 *   node verify-privacy.cjs                 # проверить прод
 *   node verify-privacy.cjs --local          # проверить локальный privacy-policy.html
 *
 * Реквизиты (индекс, email) сверены с решением владельца 05.09.2026:
 * оставить прод-значения 141400 / policy@es-trans.ru, не откатывать на
 * присланные юристами 141590 / info@es-trans.pro (см. README).
 *
 * Раздел 15 (получатели ПДн) в присланном юристами тексте называет
 * только категории, без имён/ИНН — это сознательное решение владельца
 * («выложить текст юристов как есть»), поэтому здесь НЕ проверяется
 * наличие имён Яндекс/Битрикс/ТаймВэб — это ожидаемо отсутствует.
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
  'обезличенных данных о посещениях Сайта', // старый раздел 6 (получатели с ИНН)
  'ООО «ЯНДЕКС»',
  'ООО «1С-Битрикс»',
  'АО «ТаймВэб»',
];

const SECTION_TITLES = [
  '1. Общие положения',
  '2. Термины и определения',
  '3. Сведения об Операторе',
  '4. Цели обработки персональных данных',
  '5. Правовые основания обработки персональных данных',
  '6. Перечень действий с персональными данными',
  '7. Категории субъектов персональных данных',
  '8. Способы и условия обработки персональных данных',
  '9. Сроки хранения и порядок уничтожения персональных данных',
  '10. Обработка специальных категорий персональных данных',
  '11. Обработка биометрических персональных данных',
  '12. Права субъектов персональных данных',
  '13. Порядок рассмотрения обращений субъектов персональных данных',
  '14. Меры по обеспечению безопасности персональных данных',
  '15. Порядок передачи персональных данных третьим лицам',
  '16. Ответственное лицо за организацию обработки персональных данных',
  '17. Обязанности Оператора',
  '18. Ответственность',
  '19. Заключительные положения',
];

const PAGE_URL = LOCAL
  ? `file://${path.join(__dirname, 'privacy-policy.local.html')}`
  : 'https://es-trans.ru/privacy-policy.html';

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

  // Все 19 разделов присутствуют
  for (const title of SECTION_TITLES) {
    check(text.includes(title), `Раздел «${title}» присутствует`);
  }

  // Ничего не осталось от старой (10-разделной) редакции
  for (const marker of OLD_EDITION_MARKERS) {
    check(!text.includes(marker), `Нет текста старой редакции: «${marker}»`);
  }

  // Заголовок: ровно один h1, с легитимным data-lang
  const h1 = await page.evaluate(() => {
    const els = [...document.querySelectorAll('h1')];
    return {
      count: els.length,
      lang: els[0] ? els[0].getAttribute('data-lang') : null,
      textOk: els[0] ? /Политика обработки персональных данных/.test(els[0].textContent) : false,
    };
  });
  check(h1.count === 1, 'На странице ровно один <h1>', `найдено ${h1.count}`);
  check(h1.textOk, '<h1> — заголовок Политики обработки ПДн');
  check(
    h1.lang === 'privacy-policy',
    '<h1> несёт легитимный ключ data-lang="privacy-policy"',
    `найдено data-lang="${h1.lang}"`
  );

  if (LOCAL) {
    await browser.close();
    report();
    return;
  }

  // ---------- интеграция: подвал ----------
  const footer = await page.evaluate(() => {
    const a = document.querySelector('a[href="/privacy-policy.html"].footer__link');
    return a ? { text: a.textContent.trim(), lang: a.getAttribute('data-lang') } : null;
  });
  check(footer !== null, 'В подвале есть ссылка на Политику обработки ПДн');

  await browser.close();
  report();

  function report() {
    const pad = Math.max(...results.map((r) => r.label.length));
    let failed = 0;
    console.log(
      `\nПроверка Политики обработки ПДн: ${LOCAL ? 'локальный файл' : 'прод es-trans.ru'}\n`
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
