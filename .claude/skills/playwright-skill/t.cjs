const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8899/';
const st = p => p.evaluate(() => ({
  consent: localStorage.getItem('es-trans-cookie-consent'),
  banner: !!document.querySelector('.cookie-banner'),
  metrika: window.__metrikaStarted || 0,
  cookies: document.cookie || '(нет)',
}));
(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const check = (name, cond, got) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name, '→', JSON.stringify(got)); } };

  // --- Сценарий A: принять → отозвать
  console.log('\n=== A. Принять → отозвать через «Настройки cookie» ===');
  let ctx = await browser.newContext(); let p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(400);
  check('баннер показан при первом визите', (await st(p)).banner);
  await p.click('.cookie-banner__btn--accept'); await p.waitForTimeout(600);
  let s = await st(p);
  check('согласие сохранено = accepted', s.consent === 'accepted', s);
  check('Метрика запущена', s.metrika === 1, s);
  check('cookie Метрики поставлены', /_ym_uid/.test(s.cookies), s);
  check('баннер скрыт', !s.banner, s);

  await p.click('#cookie-settings-link');
  await p.waitForTimeout(1500); // после accepted идёт reload
  s = await st(p);
  check('согласие сброшено (null)', s.consent === null, s);
  check('cookie Метрики удалены', !/_ym_uid|bh=/.test(s.cookies), s);
  check('баннер показан заново', s.banner, s);
  check('Метрика НЕ перезапущена', s.metrika === 0, s);
  await ctx.close();

  // --- Сценарий B: отозвать → выбрать заново «Отказаться»
  console.log('\n=== B. Отзыв → повторный выбор «Отказаться» ===');
  ctx = await browser.newContext(); p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(300);
  await p.click('.cookie-banner__btn--accept'); await p.waitForTimeout(500);
  await p.click('#cookie-settings-link'); await p.waitForTimeout(1500);
  await p.click('.cookie-banner__btn--decline'); await p.waitForTimeout(600);
  s = await st(p);
  check('новое решение = declined', s.consent === 'declined', s);
  check('cookie не появились', !/_ym_uid/.test(s.cookies), s);
  check('Метрика не стартовала', s.metrika === 0, s);
  await ctx.close();

  // --- Сценарий C: отказ → отзыв (без reload, баннер сразу)
  console.log('\n=== C. Отказаться → отозвать ===');
  ctx = await browser.newContext(); p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(300);
  await p.click('.cookie-banner__btn--decline'); await p.waitForTimeout(500);
  check('решение = declined', (await st(p)).consent === 'declined');
  await p.click('#cookie-settings-link'); await p.waitForTimeout(700);
  s = await st(p);
  check('баннер показан без перезагрузки', s.banner, s);
  check('согласие сброшено', s.consent === null, s);
  await ctx.close();

  // --- Сценарий D: двойной клик по ссылке не плодит баннеры
  console.log('\n=== D. Двойной клик по «Настройки cookie» ===');
  ctx = await browser.newContext(); p = await ctx.newPage();
  await p.goto(URL); await p.waitForTimeout(300);
  await p.click('.cookie-banner__btn--decline'); await p.waitForTimeout(400);
  await p.click('#cookie-settings-link'); await p.waitForTimeout(400);
  await p.click('#cookie-settings-link', { force: true }).catch(()=>{});
  await p.waitForTimeout(500);
  const n = await p.evaluate(() => document.querySelectorAll('.cookie-banner').length);
  check('баннер ровно один', n === 1, { count: n });
  await ctx.close();

  // --- Сценарий E: локализация
  console.log('\n=== E. Локализация ссылки и баннера ===');
  for (const [lang, expectLink, expectAccept] of [['ru','Настройки cookie','Принимаю'],['en','Cookie settings','I accept'],['cn','Cookie 设置','我接受']]) {
    ctx = await browser.newContext(); p = await ctx.newPage();
    await p.addInitScript(l => localStorage.setItem('language', l), lang);
    await p.goto(URL); await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({
      link: document.getElementById('cookie-settings-link').textContent,
      accept: document.querySelector('.cookie-banner__btn--accept')?.textContent,
    }));
    check(`[${lang}] ссылка + кнопка переведены`, r.link === expectLink && r.accept === expectAccept, r);
    await ctx.close();
  }

  console.log(`\nИТОГ: ${pass} прошло, ${fail} провалено`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
