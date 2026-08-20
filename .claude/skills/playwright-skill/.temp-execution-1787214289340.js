
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
    
const b = await chromium.launch({ headless: true });
async function run(label, scenario) {
  const ctx = await b.newContext({ locale: 'ru-RU' });
  const p = await ctx.newPage();
  const hosts = new Set();
  p.on('request', r => { try { const h=new URL(r.url()).hostname; if(!/(^|\.)es-trans\.ru$/.test(h)) hosts.add(h);}catch(e){} });
  await p.goto('https://es-trans.ru/contacts.html', { waitUntil:'networkidle', timeout:45000 });
  await p.waitForTimeout(1500);
  if (scenario !== 'before') {
    const btn = p.locator(scenario==='accept'?'.cookie-banner__btn--accept':'.cookie-banner__btn--decline').first();
    if (await btn.count() && await btn.isVisible()) { await btn.click(); await p.waitForTimeout(5000); }
  } else await p.waitForTimeout(2500);
  const maps = [...hosts].filter(h=>/maps|yastatic|hdrc/.test(h));
  console.log(label);
  console.log('   карта(хосты):', maps.length? maps.join(', ') : 'НЕ ГРУЗИТСЯ');
  console.log('   cookie:', (await ctx.cookies()).map(c=>c.name).sort().join(', ') || '(нет)');
  await ctx.close();
}
await run('ДО ВЫБОРА', 'before');
await run('ОТКАЗ', 'decline');
await run('СОГЛАСИЕ', 'accept');
await b.close();

  } catch (error) {
    console.error('❌ Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
