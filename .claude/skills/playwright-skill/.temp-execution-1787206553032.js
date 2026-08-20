
const { chromium, firefox, webkit, devices } = require('playwright');
const helpers = require('./lib/helpers');

// Extra headers from environment variables (if configured)
const __extraHeaders = helpers.getExtraHeadersFromEnv();

/**
 * Utility to merge environment headers into context options.
 * Use when creating contexts with raw Playwright API instead of helpers.createContext().
 * @param {Object} options - Context options
 * @returns {Object} Options with extraHTTPHeaders merged in
 */
function getContextOptionsWithHeaders(options = {}) {
  if (!__extraHeaders) return options;
  return {
    ...options,
    extraHTTPHeaders: {
      ...__extraHeaders,
      ...(options.extraHTTPHeaders || {})
    }
  };
}

(async () => {
  try {
    
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'ru-RU' });
const page = await ctx.newPage();
const posts = [];
page.on('request', r => { if (r.method() === 'POST') posts.push({ url: r.url().slice(0,90), data: (r.postData()||'').slice(0,150) }); });
await page.goto('https://es-trans.ru/vacancy-driver.html', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1200);
await page.locator('.cookie-banner__btn--decline').first().click();
await page.waitForTimeout(800);
await page.locator('[data-popup="#popup-form-driver"]').first().click();
await page.waitForTimeout(1800);

const cb = page.locator('#formAgreementDriver');
console.log('чекбокс виден:', await cb.isVisible(), '| предзаполнен:', await cb.isChecked());
await page.fill('#name-driver', 'Аудит Тест');
await page.fill('#tel-driver', '+7 900 000-00-00');
await page.locator('#form-driver button[type=submit]').first().click();
await page.waitForTimeout(2500);
console.log('POST после submit БЕЗ согласия:', posts.length, JSON.stringify(posts));
const errCls = await page.locator('#form-driver ._form-error, #form-driver .checkbox._form-error').count();
console.log('подсветка ошибки:', errCls);

const r = await page.evaluate(() => {
  const l = document.querySelector('label[for=formAgreementDriver]');
  l.click();
  return {
    driver: document.querySelector('#formAgreementDriver').checked,
    offer: document.querySelector('#formAgreementOffer')?.checked ?? 'n/a',
    customs: document.querySelector('#formAgreementCustoms')?.checked ?? 'n/a',
  };
});
console.log('после клика по label:', JSON.stringify(r));
await browser.close();

  } catch (error) {
    console.error('❌ Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
