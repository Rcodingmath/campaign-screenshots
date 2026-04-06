const { webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

async function getUrlsFromExcel() {
  const files = fs.readdirSync('.').filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
  if (files.length === 0) {
    console.log('No Excel file found, falling back to urls.js');
    return require('./urls').map(url => ({ url, brand: url }));
  }

  const workbook = XLSX.readFile(files[0]);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const results = [];
  for (const row of rows) {
    const cell = row[0]; // First column
    if (!cell) continue;

    // Handle both plain text URLs and hyperlink text
    const url = typeof cell === 'string' && cell.startsWith('http') ? cell : null;
    const brand = row[0]; // Brand name or URL text

    if (url) results.push({ url, brand });
  }

  // Also extract hyperlinks from the sheet
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    const cellRef = XLSX.utils.encode_cell({ r: R, c: 0 });
    const cell = sheet[cellRef];
    if (cell && cell.l && cell.l.Target) {
      const url = cell.l.Target;
      const brand = cell.v || url;
      if (url.startsWith('http') && !results.find(r => r.url === url)) {
        results.push({ url, brand });
      }
    }
  }

  return results;
}

(async () => {
  const entries = await getUrlsFromExcel();
  console.log(`Found ${entries.length} URLs to capture`);

  if (entries.length === 0) {
    console.log('No URLs found!');
    return;
  }

  const browser = await webkit.launch();
  fs.mkdirSync('screenshots', { recursive: true });

  const results = [];

  for (const { url, brand } of entries) {
    console.log(`Capturing: ${brand} → ${url}`);
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000); // Wait for cookie banner

      const filename = url.replace(/https?:\/\//, '').replace(/[\/?.=&]/g, '_') + '.png';
      await page.screenshot({
        path: `screenshots/${filename}`,
        fullPage: false
      });

      results.push({ brand, url, filename, status: 'ok' });
      await context.close();
    } catch (err) {
      console.error(`Failed: ${url} — ${err.message}`);
      results.push({ brand, url, filename: null, status: 'error', error: err.message });
    }
  }

  await browser.close();

  // Generate HTML report
  const reportRows = results.map(r => `
    <tr>
      <td><strong>${r.brand}</strong><br/><a href="${r.url}" target="_blank">${r.url}</a></td>
      <td>${r.status === 'ok'
        ? `<img src="screenshots/${r.filename}" style="width:100%;max-width:600px;border:1px solid #ddd;border-radius:4px"/>`
        : `<span style="color:red">❌ Error: ${r.error}</span>`
      }</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Campaign Cookie Banner Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    th { background: #4a90e2; color: white; padding: 12px 16px; text-align: left; }
    td { padding: 12px 16px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    td:first-child { width: 250px; font-size: 13px; color: #555; }
    a { color: #4a90e2; word-break: break-all; }
    .summary { background: white; padding: 16px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <h1>🍪 Campaign Cookie Banner Report</h1>
  <div class="summary">
    <strong>Total:</strong> ${results.length} pages &nbsp;|&nbsp;
    <strong>✅ Success:</strong> ${results.filter(r => r.status === 'ok').length} &nbsp;|&nbsp;
    <strong>❌ Failed:</strong> ${results.filter(r => r.status === 'error').length} &nbsp;|&nbsp;
    <strong>Generated:</strong> ${new Date().toUTCString()}
  </div>
  <table>
    <thead><tr><th>Brand / URL</th><th>Screenshot (Cookie Banner Visible)</th></tr></thead>
    <tbody>${reportRows}</tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync('report.html', html);
  console.log('✅ Done! report.html generated.');
})();
