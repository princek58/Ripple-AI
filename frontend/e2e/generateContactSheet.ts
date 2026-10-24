import fs from 'node:fs';
import path from 'node:path';

export function generateContactSheet(screenshotsDir = 'C:\\RippleAI\\frontend\\qa-screenshots') {
  const checksFile = path.join(screenshotsDir, 'checks.json');
  if (!fs.existsSync(checksFile)) {
    console.error(`Checks file not found at ${checksFile}`);
    return;
  }

  const checksData = JSON.parse(fs.readFileSync(checksFile, 'utf8'));

  // Define route metadata in order
  const routes = [
    { slug: 'landing', title: 'Landing Page', path: '/' },
    { slug: 'dev-design-system', title: 'Dev Design System', path: '/dev/design-system' },
    { slug: 'app-projects', title: 'Projects Screen', path: '/app/projects' },
    { slug: 'app-overview', title: 'Overview Screen (Scanned)', path: '/app/overview' },
    { slug: 'app-graph', title: 'Architecture Graph Level 1 (Scanned)', path: '/app/graph' },
    { slug: 'app-graph-fees-l2', title: 'Architecture Graph Level 2 - Fees Module', path: '/app/graph?level=2&focus=<feesId>' },
    { slug: 'app-investigations-finding', title: 'Investigations - Broken Import Finding', path: '/app/investigations?finding=<findingId>' },
    { slug: 'app-fixes', title: 'Fixes Screen', path: '/app/fixes' },
    { slug: 'app-tests', title: 'Tests Screen', path: '/app/tests' },
    { slug: 'app-reports', title: 'Reports Screen', path: '/app/reports' },
    { slug: 'app-overview-unscanned', title: 'Overview Screen (Unscanned Project)', path: '/app/overview' },
    { slug: 'app-graph-unscanned', title: 'Graph Screen (Unscanned Project)', path: '/app/graph' },
  ];

  function formatChecks(check: any) {
    if (!check) return '<div class="check-box warn">No check data recorded</div>';

    const hasErrors =
      (check.consoleErrors && check.consoleErrors.length > 0) ||
      (check.pageErrors && check.pageErrors.length > 0) ||
      (check.failedRequests && check.failedRequests.length > 0) ||
      check.horizontalOverflow ||
      (check.unlabeledElements && check.unlabeledElements.count > 0) ||
      (check.imagesWithoutAlt && check.imagesWithoutAlt > 0) ||
      (check.forbiddenText && check.forbiddenText.length > 0) ||
      (check.sampleDataCount && check.sampleDataCount > 0 && check.isAppRoute);

    const statusBadge = hasErrors
      ? '<span class="badge bad">Checks Flagged</span>'
      : '<span class="badge good">All Automated Checks Passed</span>';

    const details: string[] = [];

    // Console / Page Errors
    const errCount = (check.consoleErrors?.length || 0) + (check.pageErrors?.length || 0);
    if (errCount > 0) {
      const msgs = [...(check.consoleErrors || []), ...(check.pageErrors || [])]
        .map((m) => `<li>${escapeHtml(String(m))}</li>`)
        .join('');
      details.push(`<div class="item warn-item"><strong>Console/Page Errors (${errCount}):</strong><ul>${msgs}</ul></div>`);
    } else {
      details.push(`<div class="item ok-item">Console/Page Errors: 0</div>`);
    }

    // Failed Network Requests
    if (check.failedRequests && check.failedRequests.length > 0) {
      const paths = check.failedRequests.map((p: string) => `<li>${escapeHtml(p)}</li>`).join('');
      details.push(`<div class="item warn-item"><strong>Failed Network Requests (${check.failedRequests.length}):</strong><ul>${paths}</ul></div>`);
    } else {
      details.push(`<div class="item ok-item">Failed Network Requests: 0</div>`);
    }

    // Horizontal Overflow
    if (check.horizontalOverflow) {
      details.push(`<div class="item warn-item"><strong>Horizontal Overflow:</strong> YES (scrollWidth: ${check.scrollWidth}px, clientWidth: ${check.clientWidth}px)</div>`);
    } else {
      details.push(`<div class="item ok-item">Horizontal Overflow: None</div>`);
    }

    // Unlabeled interactives
    if (check.unlabeledElements?.count > 0) {
      const sels = check.unlabeledElements.selectors.map((s: string) => `<li><code>${escapeHtml(s)}</code></li>`).join('');
      details.push(`<div class="item warn-item"><strong>Unlabeled Elements (${check.unlabeledElements.count}):</strong><ul>${sels}</ul></div>`);
    } else {
      details.push(`<div class="item ok-item">Unlabeled Elements: 0</div>`);
    }

    // Images without alt
    if (check.imagesWithoutAlt > 0) {
      details.push(`<div class="item warn-item"><strong>Images without alt:</strong> ${check.imagesWithoutAlt}</div>`);
    } else {
      details.push(`<div class="item ok-item">Images without alt: 0</div>`);
    }

    // Forbidden Text
    if (check.forbiddenText && check.forbiddenText.length > 0) {
      const items = check.forbiddenText
        .map((f: any) => `<li><code>${escapeHtml(f.term)}</code> in &lt;${escapeHtml(f.selector)}&gt;: "${escapeHtml(f.text)}"</li>`)
        .join('');
      details.push(`<div class="item warn-item"><strong>Forbidden text tokens (${check.forbiddenText.length}):</strong><ul>${items}</ul></div>`);
    } else {
      details.push(`<div class="item ok-item">Forbidden text (undefined, NaN, null, [object Object]): 0</div>`);
    }

    // Sample data count
    if (check.isAppRoute && check.sampleDataCount > 0) {
      details.push(`<div class="item warn-item"><strong>"Sample data" tags on /app/* route:</strong> ${check.sampleDataCount} (MUST BE 0)</div>`);
    } else {
      details.push(`<div class="item ok-item">"Sample data" tags: ${check.sampleDataCount || 0}</div>`);
    }

    return `
      <div class="check-box ${hasErrors ? 'flagged' : 'passed'}">
        <div class="check-header">${statusBadge}</div>
        <div class="check-details">${details.join('')}</div>
      </div>
    `;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let sectionsHtml = '';

  for (const r of routes) {
    const dLightName = `${r.slug}__desktop__light.png`;
    const dDarkName = `${r.slug}__desktop__dark.png`;
    const pLightName = `${r.slug}__phone__light.png`;
    const pDarkName = `${r.slug}__phone__dark.png`;

    const dLightCheck = checksData[dLightName.replace('.png', '')];
    const dDarkCheck = checksData[dDarkName.replace('.png', '')];
    const pLightCheck = checksData[pLightName.replace('.png', '')];
    const pDarkCheck = checksData[pDarkName.replace('.png', '')];

    sectionsHtml += `
      <section class="route-section" id="${r.slug}">
        <div class="route-header">
          <h2>${escapeHtml(r.title)}</h2>
          <span class="route-slug">${escapeHtml(r.path)} (slug: <code>${r.slug}</code>)</span>
        </div>

        <div class="variant-group">
          <h3>Desktop (1280 &times; 800)</h3>
          <div class="desktop-row">
            <div class="card">
              <div class="card-header">Light Theme</div>
              <a href="./${dLightName}" target="_blank">
                <img src="./${dLightName}" alt="${r.slug} desktop light" loading="lazy" />
              </a>
              <div class="card-footer">
                <a href="./${dLightName}" target="_blank" class="view-link">View Full Size (${dLightName})</a>
                ${formatChecks(dLightCheck)}
              </div>
            </div>
            <div class="card">
              <div class="card-header">Dark Theme</div>
              <a href="./${dDarkName}" target="_blank">
                <img src="./${dDarkName}" alt="${r.slug} desktop dark" loading="lazy" />
              </a>
              <div class="card-footer">
                <a href="./${dDarkName}" target="_blank" class="view-link">View Full Size (${dDarkName})</a>
                ${formatChecks(dDarkCheck)}
              </div>
            </div>
          </div>
        </div>

        <div class="variant-group">
          <h3>Phone (390 &times; 844)</h3>
          <div class="phone-row">
            <div class="card phone-card">
              <div class="card-header">Light Theme</div>
              <a href="./${pLightName}" target="_blank">
                <img src="./${pLightName}" alt="${r.slug} phone light" loading="lazy" />
              </a>
              <div class="card-footer">
                <a href="./${pLightName}" target="_blank" class="view-link">View Full Size (${pLightName})</a>
                ${formatChecks(pLightCheck)}
              </div>
            </div>
            <div class="card phone-card">
              <div class="card-header">Dark Theme</div>
              <a href="./${pDarkName}" target="_blank">
                <img src="./${pDarkName}" alt="${r.slug} phone dark" loading="lazy" />
              </a>
              <div class="card-footer">
                <a href="./${pDarkName}" target="_blank" class="view-link">View Full Size (${pDarkName})</a>
                ${formatChecks(pDarkCheck)}
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ripple AI - Visual QA Contact Sheet (Step 13a)</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --good: #4ade80;
      --bad: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    header {
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: var(--accent); }
    .subtitle { color: var(--text-muted); font-size: 14px; margin-bottom: 12px; }
    .nav-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .nav-link {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      text-decoration: none;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
    }
    .nav-link:hover { border-color: var(--accent); color: var(--accent); }
    .route-section {
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 36px;
    }
    .route-header {
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .route-header h2 { font-size: 20px; color: var(--text); }
    .route-slug { font-size: 13px; color: var(--text-muted); }
    .variant-group { margin-top: 20px; }
    .variant-group h3 { font-size: 15px; color: var(--accent); margin-bottom: 12px; }
    .desktop-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .phone-row {
      display: grid;
      grid-template-columns: 390px 390px;
      gap: 20px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .phone-card { max-width: 390px; }
    .card-header {
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.2);
      font-weight: 600;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
    }
    .card img {
      width: 100%;
      height: auto;
      display: block;
      border-bottom: 1px solid var(--border);
      background: #000;
    }
    .card-footer {
      padding: 12px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .view-link {
      color: var(--accent);
      text-decoration: none;
      font-size: 12px;
      font-weight: 500;
    }
    .view-link:hover { text-decoration: underline; }
    .check-box {
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      background: rgba(0,0,0,0.25);
    }
    .check-box.flagged { border-color: rgba(248, 113, 113, 0.4); }
    .check-box.passed { border-color: rgba(74, 222, 128, 0.3); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .badge.good { background: rgba(74, 222, 128, 0.2); color: var(--good); }
    .badge.bad { background: rgba(248, 113, 113, 0.2); color: var(--bad); }
    .check-details { display: flex; flex-direction: column; gap: 4px; font-size: 11px; }
    .item.ok-item { color: #86efac; }
    .item.warn-item { color: #fca5a5; }
    .warn-item ul { margin-left: 16px; margin-top: 2px; }
    code { font-family: monospace; background: rgba(0,0,0,0.3); padding: 1px 4px; border-radius: 3px; }
    @media (max-width: 900px) {
      .desktop-row, .phone-row { grid-template-columns: 1fr; }
      .phone-card { max-width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Ripple AI Visual QA Contact Sheet</h1>
    <p class="subtitle">Step 13a Automated Visual Verification &middot; 12 routes &middot; 48 variants (Desktop &amp; Phone, Light &amp; Dark)</p>
    <div class="nav-bar">
      ${routes.map((r) => `<a href="#${r.slug}" class="nav-link">${escapeHtml(r.title)}</a>`).join('')}
    </div>
  </header>

  <main>
    ${sectionsHtml}
  </main>
</body>
</html>`;

  fs.writeFileSync(path.join(screenshotsDir, 'index.html'), html, 'utf8');
  console.log(`[contact-sheet] Generated contact sheet at ${path.join(screenshotsDir, 'index.html')}`);
}

// Allow direct CLI invocation
if (process.argv[1] && process.argv[1].endsWith('generateContactSheet.ts')) {
  generateContactSheet();
}
