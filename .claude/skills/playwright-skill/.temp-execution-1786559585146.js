const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const report = {};

  try {
    await page.goto('file:///tmp/test-b24-mount.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    report.b24FormInsideMount = await page.evaluate(() => {
      var mount = document.getElementById('b24-form-mount');
      return mount ? mount.querySelector('.b24-form') !== null : false;
    });

    report.mountChildrenCount = await page.evaluate(() => {
      var mount = document.getElementById('b24-form-mount');
      return mount ? mount.children.length : -1;
    });

    report.formFieldsPresent = await page.evaluate(() => {
      var mount = document.getElementById('b24-form-mount');
      return mount ? mount.querySelectorAll('input, textarea').length : 0;
    });
  } catch (e) {
    report.error = e.message;
  } finally {
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})();
