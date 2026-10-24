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
    { slug: 'app-projects-unscanned', title: 'Projects Screen (Unscanned Project)', path: '/app/projects' },
    { slug: 'app-investigations-unscanned', title: 'Investigations Screen (Unscanned Project)', path: '/app/investigations' },
    { slug: 'app-fixes-unscanned', title: 'Fixes Screen (Unscanned Project)', path: '/app/fixes' },
    { slug: 'app-tests-unscanned', title: 'Tests Screen (Unscanned Project)', path: '/app/tests' },
    { slug: 'app-reports-unscanned', title: 'Reports Screen (Unscanned Project)', path: '/app/reports' },
  ];

  function formatChecks(check: any) {
    if (!check) return '<div class="check-box warn">No check data recorded</div>';

    const hasErrors =
      (check.consoleErrors && check.consoleErrors.length > 0) ||
      (check.pageErrors && check.pageErrors.length > 0) ||
      (check.failedRequests && check.failedRequests.length > 0) ||
      check.horizontalOverflow ||
      (check.nodeOverlaps && check.nodeOverlaps.length > 0) ||
      (check.landingCounters && !check.landingCounters.valid) ||
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

    // Horizontal Overflow & Offending Elements
    if (check.horizontalOverflow) {
      let elementsHtml = '';
      if (check.overflowElements && check.overflowElements.length > 0) {
        const items = check.overflowElements
          .map((e: any) => `<li><code>${escapeHtml(e.selector)}</code>: width ${e.width}px, right edge ${e.rightEdge}px</li>`)
          .join('');
        elementsHtml = `<ul>${items}</ul>`;
      }
      details.push(`<div class="item warn-item"><strong>Horizontal Overflow:</strong> YES (scrollWidth: ${check.scrollWidth}px, clientWidth: ${check.clientWidth}px)${elementsHtml}</div>`);
    } else {
      details.push(`<div class="item ok-item">Horizontal Overflow: None</div>`);
    }

    // Node Overlaps
    if (check.nodeOverlaps && check.nodeOverlaps.length > 0) {
      const overlaps = check.nodeOverlaps
        .map((o: any) => `<li>Overlap ${escapeHtml(o.overlapSize)} between <code>${escapeHtml(o.nodeA)}</code> and <code>${escapeHtml(o.nodeB)}</code></li>`)
        .join('');
      details.push(`<div class="item warn-item"><strong>Node Overlaps (${check.nodeOverlaps.length}):</strong><ul>${overlaps}</ul></div>`);
    } else {
      details.push(`<div class="item ok-item">Node Overlaps: 0</div>`);
    }

    // Clipping Warnings (Warning level, not marking overall check as failed)
    if (check.clippingWarnings && check.clippingWarnings.length > 0) {
      const warnings = check.clippingWarnings
        .map((w: any) => `<li><code>${escapeHtml(w.selector)}</code>: scroll ${escapeHtml(w.scroll)} vs client ${escapeHtml(w.client)} ("${escapeHtml(w.text)}")</li>`)
        .join('');
      details.push(`<div class="item clip-warn-item"><strong>Clipping Warnings (${check.clippingWarnings.length}):</strong><ul>${warnings}</ul></div>`);
    } else {
      details.push(`<div class="item ok-item">Clipping Warnings: 0</div>`);
    }

    // Landing Counters
    if (check.landingCounters) {
      if (check.landingCounters.valid) {
        details.push(`<div class="item ok-item">Landing Counters: Valid (4, 6, 0, Read-only)</div>`);
      } else {
        details.push(`<div class="item warn-item"><strong>Landing Counters: Invalid</strong> (Levels: ${check.landingCounters.levels}, Checks: ${check.landingCounters.checks}, Executed: ${check.landingCounters.executed}, Read-only: ${check.landingCounters.readonly})</div>`);
      }
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

  function renderCard(fileName: string, label: string, isPhone = false) {
    const fullPath = path.join(screenshotsDir, fileName);
    const key = fileName.replace('.png', '');
    const check = checksData[key];

    if (!fs.existsSync(fullPath)) {
      return `
        <div class="card ${isPhone ? 'phone-card' : ''} not-captured">
          <div class="card-header">${escapeHtml(label)}</div>
          <div class="card-empty-msg">
            <span>Not captured</span>
            <small>(Variant excluded by test scope)</small>
          </div>
        </div>
      `;
    }

    return `
      <div class="card ${isPhone ? 'phone-card' : ''}">
        <div class="card-header">${escapeHtml(label)}</div>
        <a href="./${fileName}" target="_blank">
          <img src="./${fileName}" alt="${fileName}" loading="lazy" />
        </a>
        <div class="card-footer">
          <a href="./${fileName}" target="_blank" class="view-link">View Full Size (${fileName})</a>
          ${formatChecks(check)}
        </div>
      </div>
    `;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/&lt;/g, '&lt;')
      .replace(/&gt;/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let sectionsHtml = '';

  for (const r of routes) {
    const dLightName = `${r.slug}__desktop__light.png`;
    const dDarkName = `${r.slug}__desktop__dark.png`;
    const pLightName = `${r.slug}__phone__light.png`;
    const pDarkName = `${r.slug}__phone__dark.png`;

    sectionsHtml += `
      <section class="route-section" id="${r.slug}">
        <div class="route-header">
          <h2>${escapeHtml(r.title)}</h2>
          <span class="route-slug">${escapeHtml(r.path)} (slug: <code>${r.slug}</code>)</span>
        </div>

        <div class="variant-group">
          <h3>Desktop (1280 &times; 800)</h3>
          <div class="desktop-row">
            ${renderCard(dLightName, 'Light Theme', false)}
            ${renderCard(dDarkName, 'Dark Theme', false)}
          </div>
        </div>

        <div class="variant-group">
          <h3>Phone (390 &times; 844)</h3>
          <div class="phone-row">
            ${renderCard(pLightName, 'Light Theme', true)}
            ${renderCard(pDarkName, 'Dark Theme', true)}
          </div>
        </div>
      </section>
    `;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ripple AI — Automated Visual QA Contact Sheet</title>
  <style>
    :root {
      --bg: #0F1B18;
      --surface: #16261F;
      --surface-card: #1C3028;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --border: #2B3F3A;
      --accent: #E3F57A;
      --good: #10B981;
      --bad: #EF4444;
      --warn: #F59E0B;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 32px 24px;
      line-height: 1.5;
    }
    header.main-header {
      max-width: 1600px;
      margin: 0 auto 36px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 8px;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
    }
    nav.toc {
      margin-top: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    nav.toc a {
      color: var(--accent);
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 12px;
      font-family: monospace;
    }
    nav.toc a:hover {
      background: var(--surface-card);
    }
    .route-section {
      max-width: 1600px;
      margin: 0 auto 48px;
      padding: 24px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
    }
    .route-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .route-header h2 {
      font-size: 20px;
      font-weight: 600;
    }
    .route-slug {
      color: var(--text-muted);
      font-size: 13px;
    }
    .variant-group {
      margin-bottom: 28px;
    }
    .variant-group:last-child {
      margin-bottom: 0;
    }
    .variant-group h3 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .desktop-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(560px, 1fr));
      gap: 20px;
    }
    .phone-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }
    .card {
      background: var(--surface-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-col;
      flex-direction: column;
    }
    .card.not-captured {
      opacity: 0.45;
      border-style: dashed;
      min-height: 180px;
      justify-content: space-between;
    }
    .card-empty-msg {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 16px;
      color: var(--text-muted);
      font-size: 13px;
    }
    .card-header {
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(0,0,0,0.25);
      border-bottom: 1px solid var(--border);
    }
    .card img {
      width: 100%;
      height: auto;
      display: block;
      background: #000;
      border-bottom: 1px solid var(--border);
    }
    .card-footer {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 12px;
      flex: 1;
    }
    .view-link {
      color: var(--accent);
      text-decoration: none;
      font-family: monospace;
      font-size: 11px;
    }
    .view-link:hover {
      text-decoration: underline;
    }
    .check-box {
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
    }
    .check-box.passed {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .check-box.flagged {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .check-box.warn {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
    }
    .badge.good { background: var(--good); color: #000; }
    .badge.bad { background: var(--bad); color: #fff; }
    .check-details {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .item.ok-item { color: #A7F3D0; }
    .item.warn-item { color: #FCA5A5; font-weight: 500; }
    .item.clip-warn-item { color: #FDE047; }
    .item ul {
      margin-left: 16px;
      margin-top: 2px;
    }
    code {
      font-family: monospace;
      font-size: 10px;
      background: rgba(0,0,0,0.3);
      padding: 1px 4px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <header class="main-header">
    <h1>Ripple AI — Automated Visual QA Contact Sheet</h1>
    <div class="subtitle">Complete Visual Audit across Desktop and Phone Viewports (Light and Dark Themes)</div>
    <nav class="toc">
      ${routes.map((r) => `<a href="#${r.slug}">${r.slug}</a>`).join('')}
    </nav>
  </header>
  <main>
    ${sectionsHtml}
  </main>
</body>
</html>`;

  const outputPath = path.join(screenshotsDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`[contact-sheet] Generated contact sheet at ${outputPath}`);
}
