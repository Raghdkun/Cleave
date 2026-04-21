import { chromium } from 'playwright';

(async () => {
  try {
    const b = await chromium.launch();
    const p = await b.newPage();
    const errs = [];
    const fails = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('response', r => { if (r.status() >= 400) fails.push(r.status() + ' ' + r.url()); });
    await p.goto('http://localhost:8765/', { waitUntil: 'networkidle', timeout: 15000 }).catch(e => console.log('nav err', e.message));
    await new Promise(r => setTimeout(r, 2000));
    console.log('Page errors:', errs.length);
    errs.slice(0,5).forEach(e => console.log('  -', e.slice(0,200)));
    console.log('Failed requests:', fails.length);
    fails.slice(0,10).forEach(e => console.log('  -', e));
    await b.close();
  } catch (e) {
    console.error(e);
  }
})();
