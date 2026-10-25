import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { setupPageCheckListeners, runPageChecks } from './checkHelpers.js';
import type { SeedData } from './seedHelper.js';

const screenshotsDir = 'C:\\RippleAI\\frontend\\qa-screenshots';
const seedFile = 'C:\\RippleAI\\frontend\\e2e\\.seed-info.json';
const checksJsonPath = path.join(screenshotsDir, 'checks.json');

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
  {
    slug: 'app-investigations-minigraph',
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
  for (const r of routes) {
    test(`route: ${r.slug}`, async ({ page, baseURL }) => {
      fs.mkdirSync(screenshotsDir, { recursive: true });

      if (!fs.existsSync(seedFile)) {
        throw new Error(`Seed data file missing at: ${seedFile}`);
      }
      const seed: SeedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

      let allChecks: Record<string, any> = {};
      if (fs.existsSync(checksJsonPath)) {
        try {
          allChecks = JSON.parse(fs.readFileSync(checksJsonPath, 'utf8'));
        } catch {}
      }

      const targetPath = r.pathBuilder(seed);
      const isAppRoute = targetPath.startsWith('/app');
      const targetProjectId = r.projectType === 'scanned' ? seed.scannedProjectId : seed.unscannedProjectId;

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

        await page.setViewportSize(v.viewport);

        await page.addInitScript(
          ({ theme, projectId }) => {
            try {
              if (theme) localStorage.setItem('ripple_theme', theme);
              if (projectId) localStorage.setItem('ripple_selected_project_id', projectId);
            } catch {}
          },
          { theme: v.theme, projectId: targetProjectId }
        );

        const listeners = setupPageCheckListeners(page);

        const fullUrl = `${baseURL || 'http://localhost:3100'}${targetPath}`;
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

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

        try {
          await page.waitForLoadState('networkidle', { timeout: 6000 });
        } catch {}

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

        // Landing counters scroll trigger: scroll stats band into view to trigger count-up and wait for settle
        if (r.slug === 'landing') {
          await page.evaluate(() => {
            const el = document.querySelector('[data-testid="stats-band"]');
            if (el) el.scrollIntoView({ block: 'center' });
          });
          try {
            await page.waitForFunction(
              () => {
                const levels = document.querySelector('[data-testid="stat-value-levels"]')?.textContent?.trim();
                const checks = document.querySelector('[data-testid="stat-value-checks"]')?.textContent?.trim();
                return levels === '4' && checks === '6';
              },
              { timeout: 3500 }
            );
          } catch {}
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(400);
        }

        // Open Evidence path mini graph if on app-investigations-minigraph route
        if (r.slug === 'app-investigations-minigraph') {
          const evidenceSummary = page.locator('[data-testid="evidence-path-summary"]');
          try {
            await evidenceSummary.waitFor({ state: 'visible', timeout: 6000 });
            await evidenceSummary.click();
            const miniGraph = page.locator('[data-testid="mini-graph-container"]');
            await miniGraph.waitFor({ state: 'visible', timeout: 10000 });
            await page.waitForTimeout(600);
          } catch (e) {
            console.warn('[qa] Failed to open mini evidence graph:', e);
          }
        }

        await page.screenshot({ path: screenshotFilePath, fullPage: true });

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

      fs.writeFileSync(checksJsonPath, JSON.stringify(allChecks, null, 2), 'utf8');
    });
  }
});
