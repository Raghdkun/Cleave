const playwright = require('playwright');
const urls = [
  'http://127.0.0.1:8765/grillify-test/',
  'http://127.0.0.1:8765/slice-town/',
  'http://127.0.0.1:8765/slice-town-html/',
  'http://127.0.0.1:8765/webflow/'
];

(async () => {
  const browser = await playwright.chromium.launch();
  for (const url of urls) {
    const page = await browser.newPage();
    const pageErrors = [];
    const failedRequests = [];

    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('requestfailed', req => failedRequests.push({ url: req.url(), status: 'failed' }));
    page.on('response', res => {
      try {
        if (res.status() >= 400) {
          failedRequests.push({ url: res.url(), status: res.status() });
        }
      } catch (e) {}
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
      await page.waitForTimeout(1000);
      
      const analysis = await page.evaluate(() => {
        const hasWebflow = typeof window.Webflow !== 'undefined';
        const hasDataWId = !!document.querySelector('[data-w-id]');
        const inlineStyles = Array.from(document.querySelectorAll('*[style]'))
          .filter(el => {
            const style = el.getAttribute('style') || '';
            return /transform|opacity/.test(style);
          }).length;
        return { hasWebflow, hasDataWId, inlineStyles };
      });

      console.log('URL: ' + url);
      console.log('Final URL: ' + page.url());
      console.log('Title: ' + await page.title());
      console.log('Page Errors Total: ' + pageErrors.length);
      console.log('First 5 Errors: ' + JSON.stringify(pageErrors.slice(0, 5)));
      console.log('Failed Requests Total: ' + failedRequests.length);
      console.log('First 10 Failed (URL/Status): ' + JSON.stringify(failedRequests.slice(0, 10)));
      console.log('JS Summary: ' + JSON.stringify(analysis));
      console.log('---');
    } catch (e) {
      console.log('URL: ' + url + ' failed to load: ' + e.message);
      console.log('---');
    }
    await page.close();
  }
  await browser.close();
})();
