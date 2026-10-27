import { test, expect } from '@playwright/test';
import { setupPageCheckListeners, runPageChecks, checkStickyStaysPinned } from './checkHelpers.js';

test.describe('Automated Checks Self-Test', () => {
  test('proves that automated checks detect injected defects (overlap, clipping, named overflow, invalid counters)', async ({
    page,
  }) => {
    // 1. Setup listeners on the page
    const listeners = setupPageCheckListeners(page);

    // 2. Set content with intentional defects:
    // - Two overlapping .react-flow__node elements
    // - An unexempted element with overflow:hidden whose scrollHeight > clientHeight
    // - An overflowing element beyond 390px viewport (naming selector, rightEdge, width)
    // - An invalid landing stats band showing "0" for levels
    // - Plus previous defects: unlabeled button, img without alt, "undefined", sample data
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Defect Injection Probe Page</title>
          <style>
            body { margin: 0; padding: 16px; font-family: sans-serif; position: relative; }
            .overflow-box { width: 500px; height: 40px; background: red; }
            .node-a { position: absolute; left: 10px; top: 10px; width: 150px; height: 60px; background: blue; }
            .node-b { position: absolute; left: 100px; top: 20px; width: 150px; height: 60px; background: green; }
            .clipped-box { width: 200px; height: 30px; overflow: hidden; background: yellow; }
          </style>
        </head>
        <body>
          <h1>Defect Injection Probe</h1>

          <!-- Overlapping ReactFlow nodes -->
          <div class="react-flow__node node-a" data-id="root-node">
            <span class="font-semibold">Project Root Node</span>
          </div>
          <div class="react-flow__node node-b" data-id="fees-node">
            <span class="font-semibold">Fees Module Node</span>
          </div>

          <!-- Unexempted clipping element (no line-clamp, no truncate, no title) -->
          <div id="defect-clipped-card" class="clipped-box">
            <p>Line 1 of likely cause explanation</p>
            <p>Line 2 of likely cause explanation overflowing container</p>
            <p>Line 3 of likely cause explanation that gets cut off</p>
          </div>

          <!-- Scroll container with overflow: auto whose content overflows (must NOT be reported as clipping warning) -->
          <div id="defect-scroll-container" style="width: 200px; height: 30px; overflow: auto; background: lightgray;">
            <p>Scrollable line 1</p>
            <p>Scrollable line 2 overflowing container</p>
            <p>Scrollable line 3</p>
          </div>

          <!-- Named horizontal overflow element on phone viewport -->
          <div id="defect-overflow-div" class="overflow-box">Wide overflow content</div>

          <!-- Defective landing counters showing 0 before scroll -->
          <section data-testid="stats-band">
            <span data-testid="stat-value-levels">0</span>
            <span data-testid="stat-value-checks">0</span>
            <span data-testid="stat-value-executed">0</span>
            <span data-testid="stat-value-readonly">Read-only</span>
          </section>

          <!-- Unlabeled button -->
          <button id="defect-unlabeled-btn"></button>

          <!-- Image without alt -->
          <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />

          <!-- Visible text with "undefined" -->
          <p id="defect-text">Error state: value is undefined here</p>

          <!-- Defective mini evidence graph container (missing "Investigation path" label) -->
          <div data-testid="mini-graph-container">
            <div class="legend">
              <span>Ordinary</span>
            </div>
          </div>

          <!-- Defective impact view panel (missing "static estimate" and "Round 1") -->
          <section data-testid="impact-view-panel">
            <div>Defective impact panel without required text</div>
          </section>

          <!-- Sample data tag -->
          <span class="badge">Sample data</span>
        </body>
      </html>
    `);

    // Inject console error
    await page.evaluate(() => {
      console.error('Deliberate test console error injected by self-test');
    });

    // Run automated checks (marking as an /app/* route and phone viewport)
    const result = await runPageChecks(page, true, true, listeners);

    console.log('\n--- SELF-TEST DEFECT DETECTION RESULTS ---');
    console.log('1. Console error detected:', result.consoleErrors.length > 0, result.consoleErrors);
    console.log('2. Horizontal overflow detected:', result.horizontalOverflow, `(scrollWidth: ${result.scrollWidth}, clientWidth: ${result.clientWidth})`);
    console.log('3. Offending overflow elements named:', result.overflowElements);
    console.log('4. Node overlaps detected:', result.nodeOverlaps);
    console.log('5. Clipping warnings detected:', result.clippingWarnings);
    console.log('6. Landing counters evaluated:', result.landingCounters);
    console.log('7. Unlabeled button detected:', result.unlabeledElements.count > 0, result.unlabeledElements.selectors);
    console.log('8. Image without alt detected:', result.imagesWithoutAlt > 0);
    console.log('9. Forbidden text detected:', result.forbiddenText);
    console.log('10. Sample data tag detected:', result.sampleDataCount);
    console.log('11. Mini graph check evaluated:', result.miniGraphCheck);
    console.log('-------------------------------------------\n');

    expect(result.consoleErrors).toContain('Deliberate test console error injected by self-test');
    expect(result.horizontalOverflow).toBe(true);
    expect(result.overflowElements.length).toBeGreaterThanOrEqual(1);
    expect(result.overflowElements.some((e) => e.selector.includes('defect-overflow-div') || e.selector.includes('overflow-box'))).toBe(true);

    // Overlap assertion: must detect the two nodes overlapping
    expect(result.nodeOverlaps.length).toBeGreaterThanOrEqual(1);
    const overlap = result.nodeOverlaps[0];
    expect(overlap.nodeA).toContain('Project Root Node');
    expect(overlap.nodeB).toContain('Fees Module Node');
    expect(overlap.overlapX).toBeGreaterThan(1);
    expect(overlap.overlapY).toBeGreaterThan(1);

    // Clipping assertion: must detect unexempted clipping on hidden/clip, but NOT on overflow:auto scroll containers
    expect(result.clippingWarnings.length).toBeGreaterThanOrEqual(1);
    expect(result.clippingWarnings.some((w) => w.selector.includes('defect-clipped-card') || w.selector.includes('clipped-box'))).toBe(true);
    expect(result.clippingWarnings.some((w) => w.selector.includes('defect-scroll-container'))).toBe(false);

    // Landing counters assertion: must detect invalid zeros
    expect(result.landingCounters).toBeDefined();
    expect(result.landingCounters?.valid).toBe(false);
    expect(result.landingCounters?.levels).toBe('0');

    // Mini graph check assertion: must detect missing Investigation path label and defect
    expect(result.miniGraphCheck).toBeDefined();
    expect(result.miniGraphCheck?.found).toBe(true);
    expect(result.miniGraphCheck?.investigationPathVisible).toBe(false);
    expect(result.miniGraphCheck?.valid).toBe(false);

    // Impact view check assertion: must detect missing "static estimate" and "Round 1"
    expect(result.impactCheck).toBeDefined();
    expect(result.impactCheck?.found).toBe(true);
    expect(result.impactCheck?.staticEstimateVisible).toBe(false);
    expect(result.impactCheck?.round1Visible).toBe(false);
    expect(result.impactCheck?.valid).toBe(false);
  });

  test('proves that automated checks stay quiet on a clean page', async ({ page }) => {
    const listeners = setupPageCheckListeners(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Clean Probe Page</title>
          <style>
            body { margin: 0; padding: 16px; font-family: sans-serif; }
            .node-1 { position: absolute; left: 10px; top: 10px; width: 120px; height: 50px; }
            .node-2 { position: absolute; left: 200px; top: 10px; width: 120px; height: 50px; }
            .truncated-title { width: 100px; overflow: hidden; white-space: nowrap; }
            .clamped-text { width: 150px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          </style>
        </head>
        <body>
          <h1>Clean Page</h1>

          <!-- Non-overlapping ReactFlow nodes -->
          <div class="react-flow__node node-1" data-id="clean-node-1">
            <span class="font-semibold">Node Alpha</span>
          </div>
          <div class="react-flow__node node-2" data-id="clean-node-2">
            <span class="font-semibold">Node Beta</span>
          </div>

          <!-- Exempted text elements with title, truncate, and line-clamp -->
          <div class="truncated-title truncate" title="Full Project Title That Is Long">
            Full Project Title That Is Long
          </div>
          <div class="clamped-text line-clamp-2">
            Multi-line description text that clamps gracefully
          </div>
          <div style="overflow: hidden; width: 80px;" title="Tooltip Title">
            Overflow with title
          </div>
          <!-- Scroll container with overflow: auto (must NOT trigger clipping warnings) -->
          <div id="clean-scroll-box" style="width: 150px; height: 35px; overflow: auto;">
            <p>Clean scrollable line 1</p>
            <p>Clean scrollable line 2</p>
            <p>Clean scrollable line 3</p>
          </div>

          <!-- Valid landing counters -->
          <section data-testid="stats-band">
            <span data-testid="stat-value-levels">4</span>
            <span data-testid="stat-value-checks">6</span>
            <span data-testid="stat-value-executed">0</span>
            <span data-testid="stat-value-readonly">Read-only</span>
          </section>

          <!-- Properly labeled button -->
          <button id="clean-btn" aria-label="Submit Form">Submit</button>

          <!-- Image with alt -->
          <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Transparent placeholder" />

          <!-- Valid mini evidence graph container with visible "Investigation path" label -->
          <div data-testid="mini-graph-container">
            <div class="legend">
              <span class="font-medium">Investigation path</span>
              <span>Ordinary</span>
            </div>
          </div>

          <!-- Valid impact view panel with visible "static estimate" and "Round 1" -->
          <section data-testid="impact-view-panel" style="width: 100%; box-sizing: border-box;">
            <div>This is a static estimate from code connections.</div>
            <div>Round 1: depends directly on it</div>
          </section>

          <!-- Clean text without forbidden tokens -->
          <p>Everything is operating within defined boundaries.</p>
        </body>
      </html>
    `);

    const result = await runPageChecks(page, true, true, listeners);

    console.log('\n--- SELF-TEST CLEAN PAGE RESULTS ---');
    console.log('Console errors:', result.consoleErrors.length);
    console.log('Horizontal overflow:', result.horizontalOverflow);
    console.log('Overflow elements:', result.overflowElements.length);
    console.log('Node overlaps:', result.nodeOverlaps.length);
    console.log('Clipping warnings:', result.clippingWarnings.length);
    console.log('Landing counters valid:', result.landingCounters?.valid);
    console.log('Mini graph valid:', result.miniGraphCheck?.valid);
    console.log('Impact check valid:', result.impactCheck?.valid);
    console.log('Unlabeled elements:', result.unlabeledElements.count);
    console.log('Forbidden tokens:', result.forbiddenText.length);
    console.log('Sample data tags:', result.sampleDataCount);
    console.log('------------------------------------\n');

    expect(result.consoleErrors).toHaveLength(0);
    expect(result.horizontalOverflow).toBe(false);
    expect(result.overflowElements).toHaveLength(0);
    expect(result.nodeOverlaps).toHaveLength(0);
    expect(result.clippingWarnings).toHaveLength(0);
    expect(result.landingCounters?.valid).toBe(true);
    expect(result.miniGraphCheck).toBeDefined();
    expect(result.miniGraphCheck?.found).toBe(true);
    expect(result.miniGraphCheck?.investigationPathVisible).toBe(true);
    expect(result.miniGraphCheck?.hasHorizontalOverflow).toBe(false);
    expect(result.miniGraphCheck?.valid).toBe(true);
    expect(result.impactCheck).toBeDefined();
    expect(result.impactCheck?.found).toBe(true);
    expect(result.impactCheck?.staticEstimateVisible).toBe(true);
    expect(result.impactCheck?.round1Visible).toBe(true);
    expect(result.impactCheck?.hasHorizontalOverflow).toBe(false);
    expect(result.impactCheck?.valid).toBe(true);
    expect(result.unlabeledElements.count).toBe(0);
    expect(result.forbiddenText).toHaveLength(0);
    expect(result.sampleDataCount).toBe(0);
    expect(result.svgOverlaps).toHaveLength(0);
  });

  test('proves SVG overlap check detects injected defects (overlapping text, edge through label, pill overflow, chip overlap)', async ({
    page,
  }) => {
    const listeners = setupPageCheckListeners(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>SVG Overlap Probe Page</title>
        </head>
        <body>
          <svg aria-label="Level 1 dependency graph visualization" viewBox="0 0 640 440" width="640" height="440">
            <!-- 1. Injected overlapping text -->
            <text id="probe-txt1" x="100" y="100">Module Alpha</text>
            <text id="probe-txt2" x="105" y="102">Module Beta</text>

            <!-- 2. Injected edge passing through a label -->
            <path class="edge-group" d="M 50 250 L 450 250" stroke="gray" stroke-width="2" />
            <text id="probe-through" x="250" y="250">Label in Middle</text>

            <!-- 3. Injected chip overlapping another text -->
            <g class="edge-group" transform="translate(100, 100)">
              <circle r="9" fill="white" />
              <text text-anchor="middle" dy="3">5</text>
            </g>

            <!-- 4. Injected pill overflow: text wider than pill rect -->
            <g transform="translate(300, 350)">
              <rect x="-20" y="-10" width="40" height="20" rx="10" />
              <text text-anchor="middle" dy="3.5" font-size="12">MOST AFFECTED</text>
            </g>
          </svg>
        </body>
      </html>
    `);

    const result = await runPageChecks(page, true, false, listeners);

    console.log('\n--- SELF-TEST INJECTED SVG DEFECTS RESULTS ---');
    console.log('Total SVG overlap defects detected:', result.svgOverlaps.length);
    for (const defect of result.svgOverlaps) {
      console.log(`[${defect.type}] ${defect.description}`);
    }
    console.log('---------------------------------------------\n');

    expect(result.svgOverlaps.length).toBeGreaterThanOrEqual(3);
    expect(result.svgOverlaps.some((d) => d.type === 'text-text')).toBe(true);
    expect(result.svgOverlaps.some((d) => d.type === 'text-path')).toBe(true);
    expect(result.svgOverlaps.some((d) => d.type === 'pill-overflow')).toBe(true);
  });

  test('proves clean Overview SVG card passes with zero overlaps or pill overflow', async ({
    page,
  }) => {
    const listeners = setupPageCheckListeners(page);

    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Clean SVG Card Page</title>
        </head>
        <body>
          <svg aria-label="Level 1 dependency graph visualization" viewBox="0 0 640 440" width="640" height="440">
            <!-- Center Project Node -->
            <g>
              <circle cx="320" cy="220" r="28" />
              <rect x="270" y="255" width="100" height="22" rx="4" />
              <text x="320" y="270" text-anchor="middle" font-size="12">temp_demo_erp</text>
            </g>

            <!-- Module 1 -->
            <g>
              <circle cx="150" cy="100" r="20" />
              <rect x="115" y="130" width="70" height="18" rx="3" />
              <text x="150" y="142" text-anchor="middle" font-size="11">shared</text>
            </g>

            <!-- Module 2 (Most Affected) with properly sized pill -->
            <g>
              <circle cx="490" cy="100" r="20" />
              <circle cx="490" cy="100" r="26" fill="none" stroke="orange" stroke-dasharray="4 2" />
              <rect x="455" y="136" width="70" height="18" rx="3" />
              <text x="490" y="148" text-anchor="middle" font-size="11">fees</text>
              <g transform="translate(490, 66)">
                <rect x="-44" y="-10" width="88" height="20" rx="10" />
                <text text-anchor="middle" dy="3.5" font-size="9">MOST AFFECTED</text>
              </g>
            </g>

            <!-- Outward curved edge with chip clear of all labels -->
            <g class="edge-group">
              <path d="M 150 100 Q 320 20 490 100" stroke="gray" stroke-width="1.5" />
              <g transform="translate(320, 60)">
                <circle r="9" fill="white" />
                <text text-anchor="middle" dy="3" font-size="10">2</text>
              </g>
            </g>
          </svg>
        </body>
      </html>
    `);

    const result = await runPageChecks(page, true, false, listeners);

    console.log('\n--- SELF-TEST CLEAN SVG CARD RESULTS ---');
    console.log('SVG overlap count on clean card:', result.svgOverlaps.length);
    console.log('----------------------------------------\n');

    expect(result.svgOverlaps).toHaveLength(0);
  });

  test('proves that automated checks detect chat circle and chat panel defects (circle overlap, circle out of viewport, panel horizontal overflow, unreachable input)', async ({
    page,
  }) => {
    const listeners = setupPageCheckListeners(page);

    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Defect: Circle overlapping another interactive button
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Circle Overlap Probe</title></head>
        <body style="margin: 0; position: relative;">
          <button id="primary-action-btn" style="position: fixed; right: 16px; bottom: 16px; width: 60px; height: 60px;">Action</button>
          <button data-testid="chat-circle-button" aria-label="Open Ripple AI chat" style="position: fixed; right: 16px; bottom: 16px; width: 56px; height: 56px;">Chat</button>
        </body>
      </html>
    `);

    const overlapResult = await runPageChecks(page, true, true, listeners);
    expect(overlapResult.chatCircleCheck).toBeDefined();
    expect(overlapResult.chatCircleCheck?.found).toBe(true);
    expect(overlapResult.chatCircleCheck?.overlapsInteractive).toBe(true);
    expect(overlapResult.chatCircleCheck?.valid).toBe(false);

    // 2. Defect: Circle out of viewport
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Circle Viewport Probe</title></head>
        <body style="margin: 0; position: relative;">
          <button data-testid="chat-circle-button" aria-label="Open Ripple AI chat" style="position: fixed; right: -50px; bottom: 16px; width: 56px; height: 56px;">Chat</button>
        </body>
      </html>
    `);

    const outViewportResult = await runPageChecks(page, true, true, listeners);
    expect(outViewportResult.chatCircleCheck).toBeDefined();
    expect(outViewportResult.chatCircleCheck?.insideViewport).toBe(false);
    expect(outViewportResult.chatCircleCheck?.valid).toBe(false);

    // 3. Defect: Chat panel with horizontal overflow on mobile
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Panel Overflow Probe</title></head>
        <body style="margin: 0; position: relative;">
          <div data-testid="chat-panel" style="position: fixed; inset: 0; width: 450px; overflow-x: auto;">
            <div style="width: 500px; height: 100px;">Wide Content</div>
            <textarea data-testid="chat-input" style="width: 100%; height: 40px;"></textarea>
          </div>
        </body>
      </html>
    `);

    const panelOverflowResult = await runPageChecks(page, true, true, listeners);
    expect(panelOverflowResult.chatPanelCheck).toBeDefined();
    expect(panelOverflowResult.chatPanelCheck?.found).toBe(true);
    expect(panelOverflowResult.chatPanelCheck?.noHorizontalOverflow).toBe(false);
    expect(panelOverflowResult.chatPanelCheck?.valid).toBe(false);

    // 4. Defect: Chat panel with unreachable input (e.g. display: none)
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Panel Unreachable Input Probe</title></head>
        <body style="margin: 0; position: relative;">
          <div data-testid="chat-panel" style="position: fixed; inset: 0; width: 390px;">
            <textarea data-testid="chat-input" style="display: none;"></textarea>
          </div>
        </body>
      </html>
    `);

    const unreachableResult = await runPageChecks(page, true, true, listeners);
    expect(unreachableResult.chatPanelCheck).toBeDefined();
    expect(unreachableResult.chatPanelCheck?.found).toBe(true);
    expect(unreachableResult.chatPanelCheck?.inputReachable).toBe(false);
    expect(unreachableResult.chatPanelCheck?.valid).toBe(false);

    // 5. Clean / Valid circle and panel
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Clean Circle and Panel</title></head>
        <body style="margin: 0; position: relative;">
          <div data-testid="chat-panel" style="position: fixed; inset: 0; width: 390px; height: 844px; overflow: hidden;">
            <textarea data-testid="chat-input" style="position: absolute; bottom: 16px; left: 16px; width: 358px; height: 40px;"></textarea>
          </div>
          <button data-testid="chat-circle-button" aria-label="Close Ripple AI chat" style="position: fixed; right: 16px; bottom: 16px; width: 56px; height: 56px;">Chat</button>
        </body>
      </html>
    `);

    const cleanResult = await runPageChecks(page, true, true, listeners);
    expect(cleanResult.chatCircleCheck?.valid).toBe(true);
    expect(cleanResult.chatPanelCheck?.valid).toBe(true);
  });

  test('proves that automated checks detect sticky zoom defects (unpinned stage top drift, failure to reach L4) and pass on a pinned stage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Defect: Unpinned stage (stage top scrolls off / changes position)
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Unpinned Stage Defect</title></head>
        <body style="margin: 0;">
          <div style="height: 1000px;">Above Content</div>
          <section data-testid="sticky-graph-interactive" style="position: relative; height: 2600px;">
            <div class="sticky" style="position: static;">
              <span class="font-mono">L1 Project</span>
              <div style="height: 400px;">Stage Content</div>
            </div>
          </section>
        </body>
      </html>
    `);

    const unpinnedResult = await checkStickyStaysPinned(page);
    expect(unpinnedResult.found).toBe(true);
    expect(unpinnedResult.pinnedConstant).toBe(false);
    expect(unpinnedResult.valid).toBe(false);

    // 2. Defect: Stage stays pinned but never progresses to L4
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>No L4 Defect</title></head>
        <body style="margin: 0;">
          <div style="height: 1000px;">Above Content</div>
          <section data-testid="sticky-graph-interactive" style="position: relative; height: 2600px;">
            <div class="sticky" style="position: sticky; top: 96px;">
              <span class="font-mono">L1 Project</span>
              <div style="height: 400px;">Stage Content</div>
            </div>
          </section>
        </body>
      </html>
    `);

    const noL4Result = await checkStickyStaysPinned(page);
    expect(noL4Result.found).toBe(true);
    expect(noL4Result.pinnedConstant).toBe(true);
    expect(noL4Result.reachedL4).toBe(false);
    expect(noL4Result.valid).toBe(false);

    // 3. Clean: Pinned stage with scroll listener driving stage progression up to L4
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head><meta charset="utf-8" /><title>Working Sticky Stage</title></head>
        <body style="margin: 0;">
          <div style="height: 1000px;">Above Content</div>
          <section id="interactive-sec" data-testid="sticky-graph-interactive" style="position: relative; height: 2600px;">
            <div class="sticky" style="position: sticky; top: 96px;">
              <span id="stage-label" class="font-mono">L1 Project</span>
              <div style="height: 400px;">Stage Content</div>
            </div>
          </section>
          <script>
            window.addEventListener('scroll', () => {
              const sec = document.getElementById('interactive-sec');
              const label = document.getElementById('stage-label');
              const rect = sec.getBoundingClientRect();
              const progress = -rect.top / (rect.height - window.innerHeight);
              if (progress >= 0.75) label.textContent = 'L4 Evidence';
              else if (progress >= 0.5) label.textContent = 'L3 Code';
              else if (progress >= 0.25) label.textContent = 'L2 Module';
              else label.textContent = 'L1 Project';
            });
          </script>
        </body>
      </html>
    `);

    const workingResult = await checkStickyStaysPinned(page);
    expect(workingResult.found).toBe(true);
    expect(workingResult.pinnedConstant).toBe(true);
    expect(workingResult.reachedL4).toBe(true);
    expect(workingResult.valid).toBe(true);
  });
});
