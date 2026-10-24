import { test, expect } from '@playwright/test';
import { setupPageCheckListeners, runPageChecks } from './checkHelpers.js';

test.describe('Automated Checks Self-Test', () => {
  test('proves that automated checks can fail when defects are injected', async ({ page }) => {
    // 1. Setup listeners on the page
    const listeners = setupPageCheckListeners(page);

    // 2. Set content with intentional defects:
    // - Deliberately overflowing element (width: 2500px)
    // - Unlabeled button
    // - Image without alt
    // - Visible text containing "undefined"
    // - Visible "Sample data" tag
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Self Test Page</title>
          <style>
            body { margin: 0; padding: 16px; font-family: sans-serif; }
            .overflow-box { width: 2500px; height: 40px; background: red; }
          </style>
        </head>
        <body>
          <h1>Defect Injection Probe</h1>
          <!-- Deliberately overflowing element -->
          <div class="overflow-box">Wide overflow content</div>

          <!-- Unlabeled button -->
          <button id="defect-unlabeled-btn"></button>

          <!-- Image without alt -->
          <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />

          <!-- Visible text with "undefined" -->
          <p id="defect-text">Error state: value is undefined here</p>

          <!-- Sample data tag -->
          <span class="badge">Sample data</span>
        </body>
      </html>
    `);

    // Inject console error
    await page.evaluate(() => {
      console.error('Deliberate test console error injected by self-test');
    });

    // Run automated checks (marking as an /app/* route to check sample data tag detection)
    const result = await runPageChecks(page, true, listeners);

    // Assert that each injected defect is detected:
    console.log('\n--- SELF-TEST AUTOMATED CHECK DETECTION RESULTS ---');
    console.log('1. Console error detected:', result.consoleErrors.length > 0, result.consoleErrors);
    console.log('2. Horizontal overflow detected:', result.horizontalOverflow, `(scrollWidth: ${result.scrollWidth}, clientWidth: ${result.clientWidth})`);
    console.log('3. Unlabeled button detected:', result.unlabeledElements.count > 0, result.unlabeledElements.selectors);
    console.log('4. Image without alt detected:', result.imagesWithoutAlt > 0, `(count: ${result.imagesWithoutAlt})`);
    console.log('5. Forbidden text "undefined" detected:', result.forbiddenText.some((f) => f.term === 'undefined'), result.forbiddenText);
    console.log('6. "Sample data" tag count detected:', result.sampleDataCount);
    console.log('----------------------------------------------------\n');

    expect(result.consoleErrors).toContain('Deliberate test console error injected by self-test');
    expect(result.horizontalOverflow).toBe(true);
    expect(result.unlabeledElements.count).toBeGreaterThanOrEqual(1);
    expect(result.imagesWithoutAlt).toBeGreaterThanOrEqual(1);
    expect(result.forbiddenText.some((f) => f.term === 'undefined')).toBe(true);
    expect(result.sampleDataCount).toBe(1);
  });
});
