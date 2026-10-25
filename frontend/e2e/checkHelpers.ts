import type { Page } from '@playwright/test';

export interface OverlapIssue {
  nodeA: string;
  nodeB: string;
  overlapX: number;
  overlapY: number;
  overlapSize: string;
}

export interface ClippingWarning {
  selector: string;
  text: string;
  scroll: string;
  client: string;
}

export interface OverflowElement {
  selector: string;
  rightEdge: number;
  width: number;
}

export interface LandingCountersResult {
  found: boolean;
  levels: string | null;
  checks: string | null;
  executed: string | null;
  readonly: string | null;
  valid: boolean;
}

export interface PageCheckResult {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  horizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  overflowElements: OverflowElement[];
  unlabeledElements: {
    count: number;
    selectors: string[];
  };
  imagesWithoutAlt: number;
  forbiddenText: Array<{
    term: string;
    text: string;
    selector: string;
  }>;
  sampleDataCount: number;
  nodeOverlaps: OverlapIssue[];
  clippingWarnings: ClippingWarning[];
  landingCounters?: LandingCountersResult;
}

export function setupPageCheckListeners(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  page.removeAllListeners('response');
  page.removeAllListeners('requestfailed');

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('response', (response) => {
    if (!response.ok() && response.status() >= 400) {
      try {
        const url = new URL(response.url());
        failedRequests.push(url.pathname);
      } catch {
        failedRequests.push(response.url());
      }
    }
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure?.errorText?.includes('ERR_ABORTED')) {
      return;
    }
    try {
      const url = new URL(request.url());
      failedRequests.push(url.pathname);
    } catch {
      failedRequests.push(request.url());
    }
  });

  return { consoleErrors, pageErrors, failedRequests };
}

export async function runPageChecks(
  page: Page,
  isAppRoute: boolean,
  isPhone: boolean,
  collected: { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[] }
): Promise<PageCheckResult> {
  const domResult = await page.evaluate(({ isApp, isPhoneViewport }) => {
    function getShortSelector(el: HTMLElement): string {
      const tag = el.tagName.toLowerCase();
      if (el.id) return `${tag}#${el.id}`;
      const testId = el.getAttribute('data-testid');
      if (testId) return `[data-testid="${testId}"]`;
      const role = el.getAttribute('role');
      if (role) return `${tag}[role="${role}"]`;
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return `${tag}[aria-label="${ariaLabel.slice(0, 20)}"]`;
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter((c) => !c.includes(':')).slice(0, 2);
        if (classes.length > 0) return `${tag}.${classes.join('.')}`;
      }
      return tag;
    }

    // 1. Horizontal overflow on phone viewport
    const docEl = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
    const clientW = docEl.clientWidth;
    const hasHorizontalOverflow = isPhoneViewport && scrollW > clientW + 1;
    const overflowElements: Array<{ selector: string; rightEdge: number; width: number }> = [];

    if (hasHorizontalOverflow) {
      const allElements = Array.from(document.querySelectorAll<HTMLElement>('*'));
      for (const el of allElements) {
        if (el === docEl || el === body) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = el.getBoundingClientRect();
        if (rect.right > clientW + 1 && rect.width > 0) {
          overflowElements.push({
            selector: getShortSelector(el),
            rightEdge: Math.round(rect.right),
            width: Math.round(rect.width),
          });
        }
      }
    }

    // 2. Buttons, links, inputs without accessible name
    const interactives = Array.from(
      document.querySelectorAll<HTMLElement>('button, a[href], input:not([type="hidden"]), select, textarea')
    );
    const unlabeled: string[] = [];

    for (const el of interactives) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const ariaLabel = el.getAttribute('aria-label')?.trim();
      const ariaLabelledby = el.getAttribute('aria-labelledby')?.trim();
      const title = el.getAttribute('title')?.trim();
      const placeholder = (el as HTMLInputElement).placeholder?.trim();
      const textContent = (el.innerText || el.textContent || '').trim();
      const hasImgAlt = !!el.querySelector('img[alt]:not([alt=""])');
      const hasSvgTitle = !!el.querySelector('svg title');

      const hasName = Boolean(
        ariaLabel || ariaLabelledby || title || placeholder || textContent || hasImgAlt || hasSvgTitle
      );

      if (!hasName) {
        unlabeled.push(getShortSelector(el));
      }
    }

    // 3. Images without alt
    const imgsWithoutAlt = Array.from(document.querySelectorAll('img:not([alt])')).length;

    // 4. Forbidden text: "undefined", "NaN", "[object Object]", "null"
    const forbiddenTerms = ['undefined', 'NaN', '[object Object]', 'null'];
    const foundForbidden: Array<{ term: string; text: string; selector: string }> = [];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let currentNode: Node | null;

    while ((currentNode = walker.nextNode())) {
      const val = currentNode.nodeValue;
      if (!val) continue;

      const parent = currentNode.parentElement;
      if (!parent) continue;

      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      for (const term of forbiddenTerms) {
        let match = false;
        if (term === '[object Object]') {
          match = val.includes('[object Object]');
        } else {
          const regex = new RegExp(`\\b${term}\\b`);
          match = regex.test(val);
        }

        if (match) {
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style') continue;

          foundForbidden.push({
            term,
            text: val.trim().slice(0, 80),
            selector: getShortSelector(parent),
          });
        }
      }
    }

    // 5. Visible "Sample data" tag count on /app/* pages
    let sampleDataCount = 0;
    const allElements = Array.from(document.querySelectorAll<HTMLElement>('*'));
    for (const el of allElements) {
      if (el.children.length === 0) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text === 'sample data') {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            sampleDataCount++;
          }
        }
      }
    }

    // 6. Overlap check for all .react-flow__node elements (bounding boxes must not overlap > 1px in either direction)
    const nodeElements = Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node'));
    const nodeOverlaps: Array<{
      nodeA: string;
      nodeB: string;
      overlapX: number;
      overlapY: number;
      overlapSize: string;
    }> = [];

    const nodesWithBoxes = nodeElements
      .map((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const idAttr = el.getAttribute('data-id');
        const heading = el.querySelector('[data-testid="node-title"], .font-semibold, .font-medium, h3, h4, span')?.textContent?.trim();
        const fallbackText = (el.innerText || el.textContent || '').trim().split('\n')[0].slice(0, 35);
        const label = heading || idAttr || fallbackText || 'unknown-node';

        return { el, rect, label };
      })
      .filter((n): n is { el: HTMLElement; rect: DOMRect; label: string } => n !== null);

    for (let i = 0; i < nodesWithBoxes.length; i++) {
      for (let j = i + 1; j < nodesWithBoxes.length; j++) {
        const a = nodesWithBoxes[i];
        const b = nodesWithBoxes[j];

        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);

        if (overlapX > 1 && overlapY > 1) {
          const oX = Math.round(overlapX);
          const oY = Math.round(overlapY);
          nodeOverlaps.push({
            nodeA: a.label,
            nodeB: b.label,
            overlapX: oX,
            overlapY: oY,
            overlapSize: `${oX}x${oY}`,
          });
        }
      }
    }

    // 7. Clipping check (warning level): visible elements with overflow hidden or clip whose
    // scrollHeight > clientHeight + 1 or scrollWidth > clientWidth + 1,
    // EXCEPT elements with line-clamp or truncate class or a title attribute.
    const clippingWarnings: Array<{
      selector: string;
      text: string;
      scroll: string;
      client: string;
    }> = [];

    const clippingCandidates = Array.from(document.querySelectorAll<HTMLElement>('*'));
    for (const el of clippingCandidates) {
      if (el === docEl || el === body) continue;
      if (el.tagName.toLowerCase() === 'svg' || el.tagName.toLowerCase() === 'path') continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.clientWidth === 0 && el.clientHeight === 0) continue;

      const ox = style.overflowX;
      const oy = style.overflowY;
      const o = style.overflow;

      // Must only consider elements whose computed overflow is hidden or clip (not auto or scroll)
      if (o === 'auto' || o === 'scroll' || ox === 'auto' || ox === 'scroll' || oy === 'auto' || oy === 'scroll') {
        continue;
      }

      const isXHidden = ox === 'hidden' || ox === 'clip';
      const isYHidden = oy === 'hidden' || oy === 'clip';

      if (!isXHidden && !isYHidden) continue;

      // Check exemptions:
      const classStr = el.className && typeof el.className === 'string' ? el.className : '';
      const hasLineClamp = classStr.includes('line-clamp') || (style.webkitLineClamp !== '' && style.webkitLineClamp !== 'none');
      const hasTruncate = classStr.includes('truncate');
      const hasTitle = el.hasAttribute('title') && Boolean(el.getAttribute('title')?.trim());

      if (hasLineClamp || hasTruncate || hasTitle) {
        continue;
      }

      const isScrollHeightClipped = isYHidden && el.scrollHeight > el.clientHeight + 1;
      const isScrollWidthClipped = isXHidden && el.scrollWidth > el.clientWidth + 1;

      if (isScrollHeightClipped || isScrollWidthClipped) {
        const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        clippingWarnings.push({
          selector: getShortSelector(el),
          text,
          scroll: `${el.scrollWidth}x${el.scrollHeight}`,
          client: `${el.clientWidth}x${el.clientHeight}`,
        });
      }
    }

    // 8. Landing counters check
    const statsBand = document.querySelector('[data-testid="stats-band"]');
    let landingCounters: LandingCountersResult | undefined;
    if (statsBand) {
      const levelsEl = document.querySelector('[data-testid="stat-value-levels"]');
      const checksEl = document.querySelector('[data-testid="stat-value-checks"]');
      const executedEl = document.querySelector('[data-testid="stat-value-executed"]');
      const readonlyEl = document.querySelector('[data-testid="stat-value-readonly"]');

      const levelsVal = levelsEl?.textContent?.trim() ?? null;
      const checksVal = checksEl?.textContent?.trim() ?? null;
      const executedVal = executedEl?.textContent?.trim() ?? null;
      const readonlyVal = readonlyEl?.textContent?.trim() ?? null;

      const isValid =
        levelsVal === '4' &&
        checksVal === '6' &&
        executedVal === '0' &&
        readonlyVal === 'Read-only';

      landingCounters = {
        found: true,
        levels: levelsVal,
        checks: checksVal,
        executed: executedVal,
        readonly: readonlyVal,
        valid: isValid,
      };
    }

    return {
      horizontalOverflow: hasHorizontalOverflow,
      scrollWidth: scrollW,
      clientWidth: clientW,
      overflowElements,
      unlabeledElements: {
        count: unlabeled.length,
        selectors: unlabeled.slice(0, 10),
      },
      imagesWithoutAlt: imgsWithoutAlt,
      forbiddenText: foundForbidden,
      sampleDataCount,
      nodeOverlaps,
      clippingWarnings,
      landingCounters,
    };
  }, { isApp: isAppRoute, isPhoneViewport: isPhone });

  return {
    consoleErrors: collected.consoleErrors,
    pageErrors: collected.pageErrors,
    failedRequests: collected.failedRequests,
    horizontalOverflow: domResult.horizontalOverflow,
    scrollWidth: domResult.scrollWidth,
    clientWidth: domResult.clientWidth,
    overflowElements: domResult.overflowElements,
    unlabeledElements: domResult.unlabeledElements,
    imagesWithoutAlt: domResult.imagesWithoutAlt,
    forbiddenText: domResult.forbiddenText,
    sampleDataCount: domResult.sampleDataCount,
    nodeOverlaps: domResult.nodeOverlaps,
    clippingWarnings: domResult.clippingWarnings,
    landingCounters: domResult.landingCounters,
  };
}
