#!/usr/bin/env node
/**
 * Проверка выкладки Политики использования файлов cookie на es-trans.ru.
 *
 *   node verify.cjs                 # проверить прод
 *   node verify.cjs --local         # проверить локальный cookie-policy.html
 *   node verify.cjs --date 05.09.2026
 *
 * Проверяет саму страницу (реквизиты, разделы, отсутствие чужого
 * data-lang), интеграцию (ссылка в подвале, три ссылки в баннере,
 * кнопка «Согласен») и поведение (до согласия — ноль cookie и ноль
 * обращений к внешним хостам).
 *
 * В режиме --local проверяются только пункты по самой странице:
 * исходник содержит директивы @@include, шапки и подвала в нём нет,
 * баннер не подключён.
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
const dateArg = argv.indexOf('--date');
const EXPECTED_DATE = dateArg !== -1 ? argv[dateArg + 1] : '04.09.2026';

const INN = {
  yandex: '7736207543',
  timeweb: '7810353960',
};

// Реквизиты, согласованные с владельцем 05.09.2026. В исходной вёрстке
// стояли 141590 и info@es-trans.pro — оба заменены, см. README.
const ZIP = '141400';
const WRONG_ZIP = '141590';
const EMAIL = 'policy@es-trans.ru';
const WRONG_EMAIL = 'info@es-trans.pro';

// В --local открывается cookie-policy.local.html — сборка исходника
// без директив @@include (их браузер не понимает). Собирается скриптом
// build-local.py, см. README.
const COOKIE_URL = LOCAL
  ? `file://${path.join(__dirname, 'cookie-policy.local.html')}`
  : 'https://es-trans.ru/cookie-policy.html';

const results = [];
const check = (ok, label, detail = '') => results.push({ ok, label, detail });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });

  // Внешние хосты, к которым страница обращается до выбора в баннере.
  const externalHosts = new Set();
  context.on('request', (req) => {
    try {
      const h = new URL(req.url()).hostname;
      if (h && !h.endsWith('es-trans.ru')) externalHosts.add(h);
    } catch (_) {
      /* about:blank, file:// и т.п. */
    }
  });

  const page = await context.newPage();

  // ---------- сама страница ----------
  const resp = await page.goto(COOKIE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  if (!LOCAL) {
    check(resp && resp.status() === 200, 'Страница отдаёт 200', resp ? `HTTP ${resp.status()}` : 'нет ответа');
  }

  const text = await page.evaluate(() => document.body.innerText);

  check(text.includes(EXPECTED_DATE), `Дата документа ${EXPECTED_DATE}`);

  // Реквизиты
  check(
    text.includes(ZIP) && !text.includes(WRONG_ZIP),
    `Индекс ${ZIP} (не ${WRONG_ZIP})`
  );
  check(
    text.includes(EMAIL) && !text.includes(WRONG_EMAIL),
    `Почта ${EMAIL} (не ${WRONG_EMAIL})`
  );
  check(text.includes('5047078788'), 'ИНН оператора 5047078788');
  check(text.includes('1065047062574'), 'ОГРН оператора 1065047062574');

  // Получатели в разделе 9
  for (const [who, inn] of Object.entries(INN)) {
    check(text.includes(inn), `ИНН ${who} (${inn}) в перечне получателей`);
  }
  check(
    !/ООО\s*«ТаймВэб»/i.test(text),
    'Timeweb указан как АО, не ООО'
  );

  // Разделы, добавленные при правке вёрстки
  check(
    /Яндекс\.Карты/.test(text),
    'Раздел про Яндекс.Карты присутствует'
  );
  check(
    text.includes('localStorage'),
    'Механизм хранения выбора назван прямо (localStorage)'
  );
  check(
    !text.includes('сохранения информации о выборе пользователя'),
    'Несуществующий cookie согласия убран из технически необходимых'
  );
  check(
    text.includes('кнопки «Согласен»'),
    'Название кнопки в п. 6.3 — «Согласен»'
  );

  // Заголовок: ровно один h1, без чужого ключа локализации
  const h1 = await page.evaluate(() => {
    const els = [...document.querySelectorAll('h1')];
    // Чужой ключ ищем по всему телу страницы, а не только на <h1>:
    // если заголовок съедет обратно на <h2>, атрибут иначе не заметить.
    const stray = [...document.querySelectorAll('[data-lang="privacy-policy"]')];
    return {
      count: els.length,
      lang: stray.length ? 'privacy-policy' : null,
      textOk: els[0] ? /cookie/i.test(els[0].textContent) : false,
    };
  });
  check(h1.count === 1, 'На странице ровно один <h1>', `найдено ${h1.count}`);
  check(h1.textOk, '<h1> — заголовок Политики cookie');
  check(
    h1.lang === null,
    'На <h1> нет чужого data-lang="privacy-policy"',
    h1.lang ? `найден data-lang="${h1.lang}"` : ''
  );

  // Ссылки на Политику ПДн — гиперссылками, а не текстом
  const policyLinks = await page.evaluate(
    () => document.querySelectorAll('a[href="/privacy-policy.html"]').length
  );
  check(
    policyLinks >= 2,
    'Ссылки на Политику ПДн (п. 1.3 и 9.3) — гиперссылки',
    `найдено ${policyLinks}`
  );

  if (LOCAL) {
    await browser.close();
    report();
    return;
  }

  // ---------- интеграция: подвал ----------
  const footer = await page.evaluate(() => {
    const a = document.querySelector('a[href="/cookie-policy.html"].footer__link');
    return a ? { text: a.textContent.trim(), lang: a.getAttribute('data-lang') } : null;
  });
  check(footer !== null, 'В подвале есть ссылка на Политику cookie');
  check(
    footer !== null && footer.lang !== null,
    'Ссылка в подвале локализуется (есть data-lang)',
    footer && !footer.lang ? 'data-lang отсутствует' : ''
  );

  // ---------- интеграция: баннер ----------
  // Баннер показывается только до выбора — контекст свежий, localStorage пуст.
  await page.waitForTimeout(1000);
  const banner = await page.evaluate(() => {
    const el = document.querySelector('.cookie-banner');
    if (!el) return null;
    return {
      visible: el.classList.contains('cookie-banner--visible'),
      links: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
      accept: (el.querySelector('.cookie-banner__btn--accept') || {}).textContent,
      decline: (el.querySelector('.cookie-banner__btn--decline') || {}).textContent,
    };
  });

  check(banner !== null, 'Баннер отрисован');
  if (banner) {
    check(
      banner.links.includes('/cookie-policy.html'),
      'В баннере есть ссылка на Политику cookie',
      `ссылки: ${banner.links.join(', ')}`
    );
    check(
      banner.links.length === 3,
      'В баннере три ссылки',
      `найдено ${banner.links.length}`
    );
    check(
      (banner.accept || '').trim() === 'Согласен',
      'Кнопка согласия называется «Согласен»',
      `найдено «${(banner.accept || '').trim()}»`
    );
    check(
      (banner.decline || '').trim() === 'Отказаться',
      'Кнопка отказа называется «Отказаться»',
      `найдено «${(banner.decline || '').trim()}»`
    );
  }

  // ---------- поведение: до согласия ничего не грузится ----------
  const cookies = await context.cookies();
  check(
    cookies.length === 0,
    'До выбора не установлено ни одного cookie',
    cookies.length ? cookies.map((c) => c.name).join(', ') : ''
  );
  check(
    externalHosts.size === 0,
    'До выбора нет обращений к внешним хостам',
    externalHosts.size ? [...externalHosts].join(', ') : ''
  );

  // ---------- локализация не ломает кнопку ----------
  // Регрессия «двух копий словаря»: если app.min.js не пропатчен,
  // переключение языка вернёт «Принимаю» из словаря сайта.
  const langSwitched = await page.evaluate(() => {
    const sel = document.querySelector('select');
    if (!sel) return null;
    sel.value = 'en';
    sel.dispatchEvent(new Event('change'));
    return true;
  });
  if (langSwitched) {
    await page.waitForTimeout(600);
    const afterSwitch = await page.evaluate(() => {
      const b = document.querySelector('.cookie-banner__btn--accept');
      return b ? b.textContent.trim() : null;
    });
    check(
      afterSwitch !== 'Принимаю' && afterSwitch !== 'I accept',
      'После переключения языка кнопка не откатывается к «Принимаю»/«I accept»',
      `найдено «${afterSwitch}» — если старый текст, словарь в app.min.js не пропатчен`
    );
  }

  await browser.close();
  report();

  function report() {
    const pad = Math.max(...results.map((r) => r.label.length));
    let failed = 0;
    console.log(
      `\nПроверка Политики cookie: ${LOCAL ? 'локальный файл' : 'прод es-trans.ru'}\n`
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
