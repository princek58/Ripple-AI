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

export interface MiniGraphCheckResult {
  found: boolean;
  investigationPathVisible: boolean;
  hasHorizontalOverflow: boolean;
  valid: boolean;
}

export interface ImpactCheckResult {
  found: boolean;
  staticEstimateVisible: boolean;
  round1Visible: boolean;
  hasHorizontalOverflow: boolean;
  valid: boolean;
}

export interface SvgOverlapIssue {
  type: 'text-text' | 'text-chip' | 'text-path' | 'pill-overflow';
  elementA: string;
  elementB: string;
  overlapSize?: string;
  description: string;
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
  svgOverlaps: SvgOverlapIssue[];
  landingCounters?: LandingCountersResult;
  miniGraphCheck?: MiniGraphCheckResult;
  impactCheck?: ImpactCheckResult;
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

    // 9. Mini evidence graph check
    const miniGraphEl = document.querySelector('[data-testid="mini-graph-container"]');
    let miniGraphCheck: MiniGraphCheckResult | undefined;
    if (miniGraphEl) {
      const allTextNodes = Array.from(miniGraphEl.querySelectorAll<HTMLElement>('*'));
      const pathEl = allTextNodes.find((el) => {
        return (el.textContent || '').trim() === 'Investigation path';
      });
      let isVisible = false;
      if (pathEl) {
        const style = window.getComputedStyle(pathEl);
        const rect = pathEl.getBoundingClientRect();
        isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }
      miniGraphCheck = {
        found: true,
        investigationPathVisible: isVisible,
        hasHorizontalOverflow: hasHorizontalOverflow,
        valid: isVisible && (!isPhoneViewport || !hasHorizontalOverflow),
      };
    }

    // 10. Impact view check (Ripple View)
    const impactPanelEl = document.querySelector('[data-testid="impact-view-panel"]');
    let impactCheck: ImpactCheckResult | undefined;
    if (impactPanelEl) {
      const allTextNodes = Array.from(impactPanelEl.querySelectorAll<HTMLElement>('*'));

      // Check "static estimate" visible
      const estimateEl = allTextNodes.find((el) => {
        return (el.textContent || '').toLowerCase().includes('static estimate');
      });
      let isEstimateVisible = false;
      if (estimateEl) {
        const style = window.getComputedStyle(estimateEl);
        const rect = estimateEl.getBoundingClientRect();
        isEstimateVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;
      }

      // Check "Round 1" visible (or zero results where diagram rings are not drawn)
      const round1El = allTextNodes.find((el) => {
        const txt = (el.textContent || '').trim();
        return txt.startsWith('Round 1') || txt.includes('Round 1');
      });
      let isRound1Visible = false;
      if (round1El) {
        const style = window.getComputedStyle(round1El);
        const rect = round1El.getBoundingClientRect();
        isRound1Visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;
      }

      const isZeroImpact = Boolean(impactPanelEl.querySelector('[data-testid="zero-impact-banner"]'));
      const round1Pass = isZeroImpact || isRound1Visible;

      impactCheck = {
        found: true,
        staticEstimateVisible: isEstimateVisible,
        round1Visible: isRound1Visible,
        hasHorizontalOverflow: hasHorizontalOverflow,
        valid: isEstimateVisible && round1Pass && (!isPhoneViewport || !hasHorizontalOverflow),
      };
    }

    // 11. SVG Overlap check for Overview Level 1 card
    // For every <text> element in the card use getBBox and report overlaps with another text,
    // with a chip, and with a sampled point of any edge path (getPointAtLength every few px, excluding hidden ones);
    // and check that the "MOST AFFECTED" text box lies inside its pill box.
    const svgCards = Array.from(
      document.querySelectorAll<SVGSVGElement>(
        'svg[aria-label*="Level 1"], svg[aria-label*="dependency graph"], svg[data-testid="overview-l1-svg"]'
      )
    );
    const svgOverlaps: Array<{
      type: 'text-text' | 'text-chip' | 'text-path' | 'pill-overflow';
      elementA: string;
      elementB: string;
      overlapSize?: string;
      description: string;
    }> = [];

    for (const svg of svgCards) {
      const svgStyle = window.getComputedStyle(svg);
      if (svgStyle.display === 'none' || svgStyle.visibility === 'hidden') continue;

      const getSvgUserBox = (el: SVGGraphicsElement) => {
        const b = el.getBBox();
        const elCtm = el.getCTM();
        const svgCtm = svg.getCTM();
        if (elCtm && svgCtm) {
          const m = svgCtm.inverse().multiply(elCtm);
          const p1 = svg.createSVGPoint(); p1.x = b.x; p1.y = b.y;
          const p2 = svg.createSVGPoint(); p2.x = b.x + b.width; p2.y = b.y;
          const p3 = svg.createSVGPoint(); p3.x = b.x; p3.y = b.y + b.height;
          const p4 = svg.createSVGPoint(); p4.x = b.x + b.width; p4.y = b.y + b.height;
          const t1 = p1.matrixTransform(m);
          const t2 = p2.matrixTransform(m);
          const t3 = p3.matrixTransform(m);
          const t4 = p4.matrixTransform(m);
          const minX = Math.min(t1.x, t2.x, t3.x, t4.x);
          const maxX = Math.max(t1.x, t2.x, t3.x, t4.x);
          const minY = Math.min(t1.y, t2.y, t3.y, t4.y);
          const maxY = Math.max(t1.y, t2.y, t3.y, t4.y);
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };

      const allTextEls = Array.from(svg.querySelectorAll<SVGTextElement>('text')).filter((t) => {
        const s = window.getComputedStyle(t);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        try {
          const b = t.getBBox();
          return b.width > 0 && b.height > 0;
        } catch {
          return false;
        }
      });

      const textsWithBoxes = allTextEls.map((t) => {
        const box = getSvgUserBox(t);
        const text = (t.textContent || '').trim();
        const isChipText = t.closest('.edge-group') !== null && t.parentElement?.querySelector('circle') !== null;
        const isPillText = text.toUpperCase().includes('MOST AFFECTED');
        return { el: t, box, text, isChipText, isPillText };
      });

      // (a) Overlaps between text elements
      for (let i = 0; i < textsWithBoxes.length; i++) {
        for (let j = i + 1; j < textsWithBoxes.length; j++) {
          const a = textsWithBoxes[i];
          const b = textsWithBoxes[j];

          if (a.el.parentElement && a.el.parentElement === b.el.parentElement) continue;

          const oX = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
          const oY = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);

          if (oX > 1 && oY > 1) {
            svgOverlaps.push({
              type: 'text-text',
              elementA: a.text,
              elementB: b.text,
              overlapSize: `${Math.round(oX)}x${Math.round(oY)}`,
              description: `Text "${a.text}" overlaps text "${b.text}" by ${Math.round(oX)}x${Math.round(oY)}px`,
            });
          }
        }
      }

      // (b) Overlaps between text and chips
      const chipCircles = Array.from(svg.querySelectorAll<SVGCircleElement>('.edge-group circle, circle[r="9"]')).filter((c) => {
        const s = window.getComputedStyle(c);
        return s.display !== 'none' && s.visibility !== 'hidden';
      });

      const chipsWithBoxes = chipCircles.map((c) => ({
        el: c,
        box: getSvgUserBox(c),
      }));

      for (const t of textsWithBoxes) {
        if (t.isChipText) continue;

        for (const chip of chipsWithBoxes) {
          const oX = Math.min(t.box.x + t.box.width, chip.box.x + chip.box.width) - Math.max(t.box.x, chip.box.x);
          const oY = Math.min(t.box.y + t.box.height, chip.box.y + chip.box.height) - Math.max(t.box.y, chip.box.y);

          if (oX > 1 && oY > 1) {
            svgOverlaps.push({
              type: 'text-chip',
              elementA: t.text,
              elementB: 'edge-chip',
              overlapSize: `${Math.round(oX)}x${Math.round(oY)}`,
              description: `Text "${t.text}" overlaps count chip by ${Math.round(oX)}x${Math.round(oY)}px`,
            });
          }
        }
      }

      // (c) Overlaps with sampled points of edge paths
      const edgePaths = Array.from(svg.querySelectorAll<SVGPathElement>('.edge-group path, path[d]')).filter((p) => {
        const s = window.getComputedStyle(p);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.stroke !== 'none';
      });

      for (const pathEl of edgePaths) {
        try {
          const totalLen = pathEl.getTotalLength();
          if (totalLen <= 0) continue;

          const pCtm = pathEl.getCTM();
          const svgCtm = svg.getCTM();
          const toSvgMatrix = (pCtm && svgCtm) ? svgCtm.inverse().multiply(pCtm) : null;

          const step = 4;
          for (let len = 0; len <= totalLen; len += step) {
            let pt = pathEl.getPointAtLength(len);
            if (toSvgMatrix) {
              const svgPt = svg.createSVGPoint();
              svgPt.x = pt.x;
              svgPt.y = pt.y;
              pt = svgPt.matrixTransform(toSvgMatrix);
            }

            for (const t of textsWithBoxes) {
              if (t.isChipText || t.text === '?') continue;

              if (
                pt.x >= t.box.x &&
                pt.x <= t.box.x + t.box.width &&
                pt.y >= t.box.y &&
                pt.y <= t.box.y + t.box.height
              ) {
                svgOverlaps.push({
                  type: 'text-path',
                  elementA: t.text,
                  elementB: pathEl.getAttribute('d') || 'edge-path',
                  description: `Edge path intersects text "${t.text}" at (${Math.round(pt.x)}, ${Math.round(pt.y)})`,
                });
                break;
              }
            }
          }
        } catch {}
      }

      // (d) Check that "MOST AFFECTED" text box lies inside its pill box
      for (const t of textsWithBoxes) {
        if (t.isPillText) {
          const parentG = t.el.parentElement;
          const pillRect = parentG?.querySelector('rect');
          if (pillRect) {
            try {
              const tBox = t.el.getBBox();
              const rBox = pillRect.getBBox();

              const textLeft = tBox.x;
              const textTop = tBox.y;
              const textRight = tBox.x + tBox.width;
              const textBottom = tBox.y + tBox.height;

              const rectLeft = rBox.x;
              const rectTop = rBox.y;
              const rectRight = rBox.x + rBox.width;
              const rectBottom = rBox.y + rBox.height;

              const isInside =
                textLeft >= rectLeft - 0.5 &&
                textTop >= rectTop - 0.5 &&
                textRight <= rectRight + 0.5 &&
                textBottom <= rectBottom + 0.5;

              if (!isInside) {
                svgOverlaps.push({
                  type: 'pill-overflow',
                  elementA: t.text,
                  elementB: 'pill-rect',
                  description: `"MOST AFFECTED" text box extends outside pill box (text: [${Math.round(textLeft)}, ${Math.round(textTop)}, ${Math.round(tBox.width)}, ${Math.round(tBox.height)}], pill: [${Math.round(rectLeft)}, ${Math.round(rectTop)}, ${Math.round(rBox.width)}, ${Math.round(rBox.height)}])`,
                });
              }
            } catch {}
          }
        }
      }
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
      svgOverlaps,
      landingCounters,
      miniGraphCheck,
      impactCheck,
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
    svgOverlaps: domResult.svgOverlaps,
    landingCounters: domResult.landingCounters,
    miniGraphCheck: domResult.miniGraphCheck,
    impactCheck: domResult.impactCheck,
  };
}
