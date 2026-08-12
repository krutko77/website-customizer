const { chromium } = require('playwright');

const TARGET_URL = 'https://es-trans.ru/';

function isGoogleRelated(url) {
  return /google|gstatic|doubleclick|googletagmanager|googleadservices|googlesyndication|g\.co\//i.test(url);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // find real opener selector once
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    const candidates = await page.evaluate(() => {
      var els = Array.from(document.querySelectorAll('a,button'));
      return els
        .filter((el) => (el.getAttribute('href') || '').includes('popup-form') || (el.getAttribute('data-fancybox') && (el.getAttribute('href')||'').includes('popup')) )
        .map((el) => ({ tag: el.tagName, href: el.getAttribute('href'), text: el.textContent.trim().slice(0,40) }));
    });
    console.error('OPENER CANDIDATES: ' + JSON.stringify(candidates));
    await ctx.close();
  }

  async function runScenario(scenarioName, clickSelector) {
    const context = await browser.newContext(); // fresh, isolated, no shared storage
    const page = await context.newPage();

    const googleRequestsBefore = [];
    const googleRequestsAfter = [];
    let consentGiven = false;

    page.on('request', (req) => {
      const url = req.url();
      if (isGoogleRelated(url)) {
        (consentGiven ? googleRequestsAfter : googleRequestsBefore).push(url);
      }
    });

    const result = { scenario: scenarioName };

    try {
      await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);

      const banner = page.locator('.cookie-banner');
      result.bannerVisible = await banner.isVisible().catch(() => false);

      const cookiesBefore = await context.cookies();
      result.cookiesBeforeConsent = cookiesBefore.map((c) => c.name).sort();

      if (result.bannerVisible && clickSelector) {
        consentGiven = true;
        await page.locator(clickSelector).click();
        await page.waitForTimeout(3000);
      }

      // open the actual popup using [data-fancybox] pattern common on this site
      const opened = await page.evaluate(() => {
        var link = document.querySelector('a[href="#popup-form"]');
        if (link) { link.click(); return true; }
        return false;
      });
      result.popupOpenAttempted = opened;
      await page.waitForTimeout(2000);

      result.formFieldsVisibleInMount = await page.evaluate(() => {
        var m = document.getElementById('b24-form-mount');
        return m ? m.querySelectorAll('input, textarea').length : null;
      });
      result.mountInnerHtmlSnippet = await page.evaluate(() => {
        var m = document.getElementById('b24-form-mount');
        return m ? m.innerHTML.slice(0, 150) : null;
      });

      const cookiesAfter = await context.cookies();
      result.cookiesAfterConsent = cookiesAfter.map((c) => c.name).sort();
      result.googleRequestsBeforeConsent = Array.from(new Set(googleRequestsBefore));
      result.googleRequestsAfterConsent = Array.from(new Set(googleRequestsAfter));
    } catch (e) {
      result.error = e.message;
    } finally {
      await context.close();
    }

    return result;
  }

  const report = {};
  try {
    report.acceptScenario = await runScenario('accept', '.cookie-banner__btn--accept');
    report.declineScenario = await runScenario('decline', '.cookie-banner__btn--decline');
  } finally {
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})();
