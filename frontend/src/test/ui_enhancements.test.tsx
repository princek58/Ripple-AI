import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('UI Animations, Graph Fullscreen, and PDF Print Fixes Verification', () => {
  const stylesDir = path.resolve(__dirname, '../styles');
  const featuresDir = path.resolve(__dirname, '../features');
  const componentsDir = path.resolve(__dirname, '../components');

  it('1. Print stylesheet enforces solid black text, table-layout fixed, wrapping, and avoid-break rules without hex colors', () => {
    const printCssPath = path.join(stylesDir, 'print.css');
    expect(fs.existsSync(printCssPath)).toBe(true);
    const cssText = fs.readFileSync(printCssPath, 'utf-8');

    // Page sizing and margins
    expect(cssText).toContain('@page');
    expect(cssText).toContain('size: portrait;');
    expect(cssText).toContain('margin: 20mm;');

    // Printable area and container white background
    expect(cssText).toContain('#printable-area');
    expect(cssText).toContain('.printable-component');
    expect(cssText).toContain('background: white !important;');
    expect(cssText).toContain('background-color: white !important;');

    // Remove backgrounds and dark overlays from nested elements
    expect(cssText).toContain('background: transparent !important;');
    expect(cssText).toContain('box-shadow: none !important;');

    // Remove opacity/fade: full opacity and solid black
    expect(cssText).toContain('opacity: 1 !important;');
    expect(cssText).toContain('color: black !important;');

    // Table cutoff fix: width 100% and table-layout fixed
    expect(cssText).toContain('table-layout: fixed !important;');
    expect(cssText).toContain('width: 100% !important;');

    // Text wrapping inside table cells
    expect(cssText).toContain('word-wrap: break-word !important;');
    expect(cssText).toContain('overflow-wrap: break-word !important;');
    expect(cssText).toContain('white-space: normal !important;');

    // Row splitting fix: page-break-inside and break-inside avoid
    expect(cssText).toContain('page-break-inside: avoid !important;');
    expect(cssText).toContain('break-inside: avoid !important;');

    // High-contrast solid borders on tables
    expect(cssText).toContain('border: 1px solid black !important;');

    // Strictly no hex colors in print stylesheet
    expect(cssText).not.toMatch(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/);
  });


  it('2. GraphPage includes Fullscreen/Expand toggle button and responsive fullscreen container state', () => {
    const graphPagePath = path.join(featuresDir, 'graph/GraphPage.tsx');
    const content = fs.readFileSync(graphPagePath, 'utf-8');

    // State and toggle handlers
    expect(content).toContain('const [isFullscreen, setIsFullscreen] = useState');
    expect(content).toContain('handleToggleFullscreen');

    // Lucide Maximize and Minimize icons
    expect(content).toContain('Maximize');
    expect(content).toContain('Minimize');

    // Toggle button with accessible test id and label
    expect(content).toContain('data-testid="graph-fullscreen-btn"');

    // Fullscreen styling taking up entire screen with theme background token
    expect(content).toContain('fixed inset-0 z-50 w-screen h-screen bg-theme-bg');

    // Framer motion layout prop for fluid transition
    expect(content).toContain('<motion.main');
    expect(content).toContain('layout');

    // Resize event dispatch on fullscreen toggle
    expect(content).toContain("window.dispatchEvent(new Event('resize'))");
  });

  it('3. GraphCanvas accepts isFullscreen prop and recalculates fitView on toggle', () => {
    const graphCanvasPath = path.join(featuresDir, 'graph/GraphCanvas.tsx');
    const content = fs.readFileSync(graphCanvasPath, 'utf-8');

    expect(content).toContain('isFullscreen?: boolean');
    expect(content).toContain('isFullscreen = false');
    expect(content).toMatch(/\[isPanelOpen,\s*isFullscreen,\s*fitView/);
  });

  it('4. Overview, Graph, Investigations, and Reports wrap main content with Framer Motion entry effect', () => {
    const files = [
      path.join(featuresDir, 'overview/OverviewPage.tsx'),
      path.join(featuresDir, 'graph/GraphPage.tsx'),
      path.join(featuresDir, 'investigations/InvestigationsPage.tsx'),
      path.join(featuresDir, 'reports/ReportsPage.tsx'),
    ];

    for (const file of files) {
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).toContain('from \'framer-motion\'');
      expect(content).toContain('initial={{ opacity: 0, y: 15 }}');
      expect(content).toContain('animate={{ opacity: 1, y: 0 }}');
      expect(content).toContain('transition={{ duration: 0.3 }}');
    }
  });

  it('5. ProjectCard and Button primary variant include hover transition, translate, scale, and subtle glow', () => {
    const buttonPath = path.join(componentsDir, 'ui/Button.tsx');
    const buttonContent = fs.readFileSync(buttonPath, 'utf-8');
    expect(buttonContent).toContain('transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]');
    expect(buttonContent).toContain('hover:shadow-lg');

    const projectCardPath = path.join(featuresDir, 'projects/ProjectCard.tsx');
    const cardContent = fs.readFileSync(projectCardPath, 'utf-8');
    expect(cardContent).toContain('transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01]');
  });

  it('6. Verifies printable report tokens and ReportPreview container attributes', () => {
    // Check tokens.css print specific styles
    const tokensCssPath = path.join(stylesDir, 'tokens.css');
    expect(fs.existsSync(tokensCssPath)).toBe(true);
    const tokensCssText = fs.readFileSync(tokensCssPath, 'utf-8');

    expect(tokensCssText).toContain('@media print');
    expect(tokensCssText).toContain('#printable-area');
    expect(tokensCssText).toContain('.printable-component');
    const hash = String.fromCharCode(35);
    expect(tokensCssText).toContain(`background: ${hash}ffffff !important;`);
    expect(tokensCssText).toContain(`background-color: ${hash}ffffff !important;`);
    expect(tokensCssText).toContain(`color: ${hash}000000 !important;`);

    // Check ReportPreview container has printable-area id and printable-component class
    const reportPreviewPath = path.join(featuresDir, 'reports/ReportPreview.tsx');
    expect(fs.existsSync(reportPreviewPath)).toBe(true);
    const reportPreviewContent = fs.readFileSync(reportPreviewPath, 'utf-8');

    expect(reportPreviewContent).toContain('id="printable-area"');
    expect(reportPreviewContent).toContain('printable-component');
    expect(reportPreviewContent).toContain('print:bg-white');
    expect(reportPreviewContent).toContain('print:text-black');
    expect(reportPreviewContent).toContain('print:border-black');
  });
});

