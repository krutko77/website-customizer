const { chromium } = require('playwright');

const TARGET_URL = 'https://es-trans.ru/services-customs.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const bitrixRequestsBeforeConsent = [];
  let consentGiven = false;

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('bitrix24')) {
      if (!consentGiven) bitrixRequestsBeforeConsent.push(url);
    }
  });

  const report = {};

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    report.bitrixFiresBeforeConsent = bitrixRequestsBeforeConsent.length > 0;
    report.bitrixRequestsBeforeConsentCount = bitrixRequestsBeforeConsent.length;
    report.bitrixRequestsSample = bitrixRequestsBeforeConsent.slice(0, 5);

    const cookiesBefore = await context.cookies();
    report.cookiesBeforeConsent = cookiesBefore.map((c) => `${c.name} (${c.domain})`).sort();

    const banner = page.locator('.cookie-banner');
    report.bannerAppears = await banner.isVisible().catch(() => false);

    // Was the chat bubble already visible before any consent action?
    const chatVisible = await page.evaluate(() => {
      return !!document.querySelector('.b24-window-mounts, [id*="b24"], iframe[src*="bitrix24"]');
    });
    report.bitrixWidgetDomPresentBeforeConsent = chatVisible;
  } catch (e) {
    report.error = e.message;
  } finally {
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})();
