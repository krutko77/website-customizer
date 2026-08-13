const { chromium } = require('playwright');
const fs = require('fs');
const TARGET_URL = 'https://es-trans.ru/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  // Remove the old (buggy) script's click listener effect isn't removable directly,
  // but since it's page-level document listener from the deployed script, we just
  // inject the FIXED script fresh — it will add its own listener; the deployed one
  // will also fire (fine, both call preventDefault, idempotent for this test) —
  // to isolate, we instead just verify by calling the fixed script's internals directly.
  const fixedJs = fs.readFileSync('/home/my_workspace/website-customizer/sites/es-trans-ru/messenger-consent/messenger-consent.js', 'utf8');

  // Clear existing consent to force modal, and neutralize old listener effects by
  // testing via a fresh isolated page evaluate of just the modal-building logic.
  const result = await page.evaluate((src) => {
    // Execute fixed script in isolated function scope, but skip the auto document
    // click listener by stripping the trailing IIFE call block via eval of only
    // the parts we need: instead, just run the whole IIFE (it's idempotent, adds
    // one more listener) then manually trigger showModal-equivalent by clicking.
    localStorage.clear();
    return true;
  }, fixedJs);

  // Simplest reliable check: inject fixed script as an additional <script>, click MAX link,
  // and inspect the LAST overlay's innerHTML (fixed script's listener also fires and
  // since old one already preventDefault+showModal'd, DOM will have two overlays —
  // we just check the newest one appended, which is the fixed script's).
  await page.addScriptTag({ content: fixedJs });
  await page.locator('a.social__link, a[href*="max.ru/"]').first().click();
  await page.waitForTimeout(300);

  const overlays = await page.locator('.messenger-consent-overlay').all();
  console.log('overlay count', overlays.length);
  const last = overlays[overlays.length - 1];
  const html = await last.locator('.messenger-consent__text').innerHTML();
  console.log('--- last overlay text innerHTML ---');
  console.log(html);
  const linkCount = await last.locator('.messenger-consent__text a').count();
  console.log('links in last overlay:', linkCount);
  const linkTexts = await last.locator('.messenger-consent__text a').allTextContents();
  console.log('link texts:', JSON.stringify(linkTexts));

  await browser.close();
})();
