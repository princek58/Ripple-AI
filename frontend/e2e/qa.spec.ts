import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { setupPageCheckListeners, runPageChecks, type PageCheckResult } from './checkHelpers.js';
import type { SeedData } from './seedHelper.js';

const screenshotsDir = 'C:\\RippleAI\\frontend\\qa-screenshots';
const seedFile = 'C:\\RippleAI\\frontend\\e2e\\.seed-info.json';

interface RouteDef {
  slug: string;
  pathBuilder: (seed: SeedData) => string;
  projectType: 'scanned' | 'unscanned';
  variantsOnly?: Array<{ device: 'desktop' | 'phone'; theme: 'light' | 'dark' }>;
}

const routes: RouteDef[] = [
  { slug: 'landing', pathBuilder: () => '/', projectType: 'scanned' },
  { slug: 'dev-design-system', pathBuilder: () => '/dev/design-system', projectType: 'scanned' },
  { slug: 'app-projects', pathBuilder: () => '/app/projects', projectType: 'scanned' },
  { slug: 'app-overview', pathBuilder: () => '/app/overview', projectType: 'scanned' },
  { slug: 'app-graph', pathBuilder: () => '/app/graph', projectType: 'scanned' },
  {
    slug: 'app-graph-fees-l2',
    pathBuilder: (seed) => `/app/graph?level=2&focus=${seed.feesModuleNodeId}`,
    projectType: 'scanned',
  },
  {
    slug: 'app-investigations-finding',
    pathBuilder: (seed) => `/app/investigations?finding=${seed.brokenImportFindingId}`,
    projectType: 'scanned',
  },
  { slug: 'app-fixes', pathBuilder: () => '/app/fixes', projectType: 'scanned' },
  { slug: 'app-tests', pathBuilder: () => '/app/tests', projectType: 'scanned' },
  { slug: 'app-reports', pathBuilder: () => '/app/reports', projectType: 'scanned' },
  { slug: 'app-overview-unscanned', pathBuilder: () => '/app/overview', projectType: 'unscanned' },
  { slug: 'app-graph-unscanned', pathBuilder: () => '/app/graph', projectType: 'unscanned' },
  // Extended unscanned captures in two variants only (desktop light and phone dark)
  {
    slug: 'app-projects-unscanned',
    pathBuilder: () => '/app/projects',
    projectType: 'unscanned',
    variantsOnly: [
      { device: 'desktop', theme: 'light' },
      { device: 'phone', theme: 'dark' },
    ],
  },
  {
    slug: 'app-investigations-unscanned',
    pathBuilder: () => '/app/investigations',
    projectType: 'unscanned',
    variantsOnly: [
      { device: 'desktop', theme: 'light' },
      { device: 'phone', theme: 'dark' },
    ],
  },
  {
    slug: 'app-fixes-unscanned',
    pathBuilder: () => '/app/fixes',
    projectType: 'unscanned',
    variantsOnly: [
      { device: 'desktop', theme: 'light' },
      { device: 'phone', theme: 'dark' },
    ],
  },
  {
    slug: 'app-tests-unscanned',
    pathBuilder: () => '/app/tests',
    projectType: 'unscanned',
    variantsOnly: [
      { device: 'desktop', theme: 'light' },
      { device: 'phone', theme: 'dark' },
    ],
  },
  {
    slug: 'app-reports-unscanned',
    pathBuilder: () => '/app/reports',
    projectType: 'unscanned',
    variantsOnly: [
      { device: 'desktop', theme: 'light' },
      { device: 'phone', theme: 'dark' },
    ],
  },
];

interface VariantDef {
  device: 'desktop' | 'phone';
  viewport: { width: number; height: number };
  theme: 'light' | 'dark';
}

const allVariants: VariantDef[] = [
  { device: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'light' },
  { device: 'desktop', viewport: { width: 1280, height: 800 }, theme: 'dark' },
  { device: 'phone', viewport: { width: 390, height: 844 }, theme: 'light' },
  { device: 'phone', viewport: { width: 390, height: 844 }, theme: 'dark' },
];

test.describe('Automated Visual QA Suite', () => {
  test.setTimeout(300000); // 5 minutes for full run

  test('captures screenshots and runs automated checks across routes and variants', async ({
    page,
    baseURL,
  }) => {
    fs.mkdirSync(screenshotsDir, { recursive: true });

    if (!fs.existsSync(seedFile)) {
      throw new Error(`Seed data file missing at: ${seedFile}`);
    }
    const seed: SeedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

    // Load existing checks if present so partial/grep runs preserve other recorded results
    const checksJsonPath = path.join(screenshotsDir, 'checks.json');
    let allChecks: Record<string, any> = {};
    if (fs.existsSync(checksJsonPath)) {
      try {
        allChecks = JSON.parse(fs.readFileSync(checksJsonPath, 'utf8'));
      } catch {}
    }

    for (const r of routes) {
      const targetPath = r.pathBuilder(seed);
      const isAppRoute = targetPath.startsWith('/app');
      const targetProjectId = r.projectType === 'scanned' ? seed.scannedProjectId : seed.unscannedProjectId;

      // Filter variants if route specifies variantsOnly
      const activeVariants = r.variantsOnly
        ? allVariants.filter((v) =>
            r.variantsOnly!.some((o) => o.device === v.device && o.theme === v.theme)
          )
        : allVariants;

      for (const v of activeVariants) {
        const fileKey = `${r.slug}__${v.device}__${v.theme}`;
        const screenshotFileName = `${fileKey}.png`;
        const screenshotFilePath = path.join(screenshotsDir, screenshotFileName);

        console.log(`[qa-capture] Capturing ${screenshotFileName} -> ${targetPath} (${v.device}, ${v.theme})`);

        // Set viewport
        await page.setViewportSize(v.viewport);

        // Pre-configure localStorage before navigation
        await page.addInitScript(
          ({ theme, projectId }) => {
            try {
              if (theme) localStorage.setItem('ripple_theme', theme);
              if (projectId) localStorage.setItem('ripple_selected_project_id', projectId);
            } catch {}
          },
          { theme: v.theme, projectId: targetProjectId }
        );

        // Track errors and requests
        const listeners = setupPageCheckListeners(page);

        // Navigate
        const fullUrl = `${baseURL || 'http://localhost:3100'}${targetPath}`;
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

        // Ensure theme applied to root document
        await page.evaluate(
          ({ theme, projectId }) => {
            try {
              localStorage.setItem('ripple_theme', theme);
              localStorage.setItem('ripple_selected_project_id', projectId);
            } catch {}
            const root = document.documentElement;
            root.setAttribute('data-theme', theme);
            root.style.colorScheme = theme;
            if (theme === 'dark') {
              root.classList.add('dark');
            } else {
              root.classList.remove('dark');
            }
          },
          { theme: v.theme, projectId: targetProjectId }
        );

        // Wait for page to settle
        try {
          await page.waitForLoadState('networkidle', { timeout: 6000 });
        } catch {}

        // Settle layout
        if (targetPath.includes('/app/graph')) {
          const skeleton = page.locator('[data-testid="graph-layout-skeleton"]');
          try {
            if ((await skeleton.count()) > 0) {
              await skeleton.waitFor({ state: 'detached', timeout: 12000 });
            }
          } catch {}
          await page.waitForTimeout(600);
        } else {
          await page.waitForTimeout(300);
        }

        // Landing counters scroll trigger: scroll slowly from top to bottom and back
        // so count-up animation runs and finishes before screenshot
        if (r.slug === 'landing') {
          await page.evaluate(async () => {
            const docEl = document.documentElement;
            const scrollHeight = Math.max(docEl.scrollHeight, document.body ? document.body.scrollHeight : 0);
            for (let y = 0; y < scrollHeight; y += 400) {
              window.scrollTo(0, y);
              await new Promise((resolve) => setTimeout(resolve, 80));
            }
            window.scrollTo(0, 0);
          });
          // Wait 1000ms for 800ms count-up animation to complete
          await page.waitForTimeout(1000);
        }

        // Take full-page screenshot
        await page.screenshot({ path: screenshotFilePath, fullPage: true });

        // Run automated DOM/console/network checks
        const checkResult = await runPageChecks(page, isAppRoute, v.device === 'phone', listeners);

        allChecks[fileKey] = {
          file: screenshotFileName,
          route: targetPath,
          viewport: v.device,
          theme: v.theme,
          isAppRoute,
          ...checkResult,
        };
      }
    }

    // Write checks.json
    fs.writeFileSync(checksJsonPath, JSON.stringify(allChecks, null, 2), 'utf8');
    console.log(`[qa-capture] Successfully written ${Object.keys(allChecks).length} checks to ${checksJsonPath}`);
  });
});
