const { webkit } = require('playwright'); // webkit = Safari engine (Mac)
const urls = require('./urls');
const fs = require('fs');

(async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage();

  // Set Mac screen size
  await page.setViewportSize({ width: 1440, height: 900 });

  fs.mkdirSync('screenshots', { recursive: true });

  for (const url of urls) {
    console.log(`Capturing: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });

    // Creates a safe filename from URL
    const filename = url.replace(/https?:\/\//, '').replace(/[\/?.=&]/g, '_');
    await page.screenshot({
      path: `screenshots/${filename}.png`,
      fullPage: true  // captures full page, not just viewport
    });
  }

  await browser.close();
  console.log('Done! All screenshots captured.');
})();
