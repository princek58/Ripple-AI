import type { Page } from '@playwright/test';

export interface PageCheckResult {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  horizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
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
    // 1. Horizontal overflow on phone viewport
    const docEl = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
    const clientW = docEl.clientWidth;
    const hasHorizontalOverflow = isPhoneViewport && scrollW > clientW + 1;

    // 2. Buttons, links, inputs without accessible name
    const interactives = Array.from(
      document.querySelectorAll<HTMLElement>('button, a[href], input:not([type="hidden"]), select, textarea')
    );
    const unlabeled: string[] = [];

    for (const el of interactives) {
      // Check visible/hidden
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
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const testId = el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
        unlabeled.push(`${tag}${id}${testId || cls}`);
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
          // Word boundary match so words like "nullable" or "annul" or "Banana" aren't flagged
          const regex = new RegExp(`\\b${term}\\b`);
          match = regex.test(val);
        }

        if (match) {
          // Exclude script, style, and code snippets where null/undefined might legitimately appear as code
          const tag = parent.tagName.toLowerCase();
          if (tag === 'script' || tag === 'style') continue;

          foundForbidden.push({
            term,
            text: val.trim().slice(0, 80),
            selector: `${tag}${parent.id ? `#${parent.id}` : ''}`,
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

    return {
      horizontalOverflow: hasHorizontalOverflow,
      scrollWidth: scrollW,
      clientWidth: clientW,
      unlabeledElements: {
        count: unlabeled.length,
        selectors: unlabeled.slice(0, 10),
      },
      imagesWithoutAlt: imgsWithoutAlt,
      forbiddenText: foundForbidden,
      sampleDataCount,
    };
  }, { isApp: isAppRoute, isPhoneViewport: isPhone });

  return {
    consoleErrors: collected.consoleErrors,
    pageErrors: collected.pageErrors,
    failedRequests: collected.failedRequests,
    horizontalOverflow: domResult.horizontalOverflow,
    scrollWidth: domResult.scrollWidth,
    clientWidth: domResult.clientWidth,
    unlabeledElements: domResult.unlabeledElements,
    imagesWithoutAlt: domResult.imagesWithoutAlt,
    forbiddenText: domResult.forbiddenText,
    sampleDataCount: domResult.sampleDataCount,
  };
}
