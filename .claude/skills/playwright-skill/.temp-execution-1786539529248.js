const { chromium } = require('playwright');

const TARGET_URL = 'https://es-trans.ru/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const watchRequests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('mc.yandex.ru/watch')) {
      watchRequests.push(url);
    }
  });

  const report = {};

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const banner = page.locator('.cookie-banner');
    report.bannerAppears = await banner.isVisible().catch(() => false);

    if (report.bannerAppears) {
      const declineBtn = page.locator('.cookie-banner__btn--decline');
      await declineBtn.click();
      await page.waitForTimeout(1000);

      report.bannerHidesAfterDecline = !(await banner.isVisible().catch(() => false));
      report.storageValueAfterDecline = await page.evaluate(() =>
        localStorage.getItem('es-trans-cookie-consent')
      );
      report.watchRequestsAfterDecline = watchRequests.length;

      await page.screenshot({ path: '/tmp/es-trans-after-decline.png', fullPage: false });

      // reload — banner must NOT reappear, and metrika must still NOT fire
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      report.bannerReappearsAfterReload = await banner.isVisible().catch(() => false);
      report.watchRequestsAfterReload = watchRequests.length;
      report.storageValueAfterReload = await page.evaluate(() =>
        localStorage.getItem('es-trans-cookie-consent')
      );
    } else {
      report.error = 'Banner did not appear';
    }
  } catch (e) {
    report.error = (report.error ? report.error + '; ' : '') + e.message;
  } finally {
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})();
