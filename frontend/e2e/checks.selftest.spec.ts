import { test, expect } from '@playwright/test';
import { setupPageCheckListeners, runPageChecks } from './checkHelpers.js';

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
    expect(result.unlabeledElements.count).toBe(0);
    expect(result.forbiddenText).toHaveLength(0);
    expect(result.sampleDataCount).toBe(0);
  });
});
