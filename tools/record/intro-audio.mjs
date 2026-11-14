import puppeteer from 'puppeteer-core'; import fs from 'fs';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage(); await page.setCacheEnabled(false);
page.on('pageerror', e => console.log('[pageerror]', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto((process.env.BASE || 'http://127.0.0.1:8765') + '/tools/intro-soundtrack.html', { waitUntil: 'networkidle0' });
await page.evaluate(() => window.__render());
fs.writeFileSync(process.argv[2], Buffer.from(await page.evaluate(() => window.__wav), 'base64'));
await browser.close();
