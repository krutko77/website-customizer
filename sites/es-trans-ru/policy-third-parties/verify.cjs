#!/usr/bin/env node
/**
 * Проверка выкладки патча policy-third-parties на es-trans.ru.
 *
 *   node verify.js                 # проверить прод
 *   node verify.js --local         # проверить локальные .AFTER.html
 *   node verify.js --date 19.08.2026
 *
 * Прогоняет 12 проверок по обоим документам: исчезновение старых
 * формулировок, наличие реквизитов трёх обработчиков, дата, перечень
 * действий в Согласии, сохранность нумерации раздела 6, целостность вёрстки.
 */

const path = require('path');
const PW = path.join(
  __dirname,
  '../../../.claude/skills/playwright-skill/node_modules/playwright-core'
);
const { chromium } = require(PW);

const argv = process.argv.slice(2);
const LOCAL = argv.includes('--local');
const dateArg = argv.indexOf('--date');
const EXPECTED_DATE = dateArg !== -1 ? argv[dateArg + 1] : '18.08.2026';

const OLD_DATE = '12.08.2026';
const INN = {
  yandex: '7736207543',
  bitrix: '7717586110',
  timeweb: '7810353960',
};

const url = (name) =>
  LOCAL
    ? `file://${path.join(__dirname, `${name}.AFTER.html`)}`
    : `https://es-trans.ru/${name}.html`;

const results = [];
const check = (ok, label, detail = '') =>
  results.push({ ok, label, detail });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  // ---------- privacy-policy.html ----------
  await page.goto(url('privacy-policy'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const policy = await page.evaluate(() => document.body.innerText);

  check(
    !policy.includes('никогда, ни при каких'),
    'Политика: абсолютный запрет передачи убран'
  );
  check(
    policy.includes('не передаются третьим') &&
      policy.includes('поручает обработку персональных'),
    'Политика: новая формулировка п. 6.3 на месте'
  );
  for (const [who, inn] of Object.entries(INN)) {
    check(policy.includes(inn), `Политика: ИНН ${who} (${inn})`);
  }
  check(
    policy.includes(EXPECTED_DATE) && !policy.includes(OLD_DATE),
    `Политика: дата ${EXPECTED_DATE}`
  );

  // нумерация раздела 6 должна остаться сплошной 1..8
  const section6 = await page.evaluate(() => {
    const titles = [...document.querySelectorAll('h3')];
    const h = titles.find((t) => t.textContent.trim().startsWith('6.'));
    if (!h) return null;
    let el = h.nextElementSibling;
    while (el && el.tagName !== 'OL') el = el.nextElementSibling;
    if (!el) return null;
    return [...el.children].filter((c) => c.tagName === 'LI').length;
  });
  check(
    section6 === 8,
    'Политика: раздел 6 содержит 8 пунктов верхнего уровня',
    section6 === null ? 'список не найден' : `найдено ${section6}`
  );

  const nested = await page.evaluate(() => {
    const els = [...document.querySelectorAll('li')];
    const li = els.find((e) =>
      e.textContent.includes('поручает обработку персональных')
    );
    if (!li) return 0;
    const ol = li.querySelector('ol');
    return ol ? ol.children.length : 0;
  });
  check(nested === 3, 'Политика: вложенный список из 3 получателей', `найдено ${nested}`);

  // ---------- agreement.html ----------
  await page.goto(url('agreement'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const agreement = await page.evaluate(() => document.body.innerText);

  check(
    agreement.includes('передачу (предоставление, доступ)'),
    'Согласие: «передача» добавлена в перечень действий'
  );
  check(
    !/использование, уничтожение\./.test(agreement),
    'Согласие: старый усечённый перечень действий убран'
  );
  check(
    ['запись', 'извлечение', 'обезличивание', 'блокирование', 'удаление'].every(
      (w) => agreement.includes(w)
    ),
    'Согласие: перечень действий соответствует п. 3 ст. 3 152-ФЗ'
  );
  for (const [who, inn] of Object.entries(INN)) {
    check(agreement.includes(inn), `Согласие: ИНН ${who} (${inn})`);
  }
  check(
    agreement.includes(EXPECTED_DATE) && !agreement.includes(OLD_DATE),
    `Согласие: дата ${EXPECTED_DATE}`
  );

  // Timeweb именно АО, не ООО — частая ошибка при ручной правке
  check(
    !/ООО\s*«ТаймВэб»/i.test(policy) && !/ООО\s*«ТаймВэб»/i.test(agreement),
    'Оба: Timeweb указан как АО, не ООО'
  );

  await browser.close();

  // ---------- отчёт ----------
  const pad = Math.max(...results.map((r) => r.label.length));
  let failed = 0;
  console.log(`\nПроверка: ${LOCAL ? 'локальные файлы' : 'прод es-trans.ru'}\n`);
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
})().catch((e) => {
  console.error('Ошибка выполнения:', e.message);
  process.exit(2);
});
