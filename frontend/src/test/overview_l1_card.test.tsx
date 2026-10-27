import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { getContrastRatio } from '../lib/contrast.js';
import { ProjectGraphCard } from '../features/overview/ProjectGraphCard.js';
import { computeL1Layout, boxesIntersect } from '../features/overview/l1Layout.js';
import type { GraphResponseData, GraphNode, GraphEdge } from '../../../shared/types.js';

// Real Level 1 capture fixture
import realGraphLevel1 from './fixtures/api/graph_level1.json';

function loadThemeTokens() {
  const cssPath = path.resolve(__dirname, '../styles/tokens.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const lightPart = css.split(':root')[1].split('}')[0];
  const darkPart = css.split('.dark')[1].split('}')[0];

  const parseTokens = (block: string) => {
    const tokens: Record<string, string> = {};
    const regex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(block)) !== null) {
      tokens[`--${match[1]}`] = match[2].trim();
    }
    return tokens;
  };

  const light = parseTokens(lightPart);
  const dark = parseTokens(darkPart);

  return {
    resolve: (theme: 'light' | 'dark', name: string): string => {
      if (theme === 'dark') {
        return dark[name] || light[name] || '';
      }
      return light[name] || '';
    },
  };
}

describe('Overview Level 1 Graph Card Rendering (UI-1 Part 2)', () => {
  it('1. pill text contrast in both themes meets WCAG AA >= 4.5:1', () => {
    const { resolve } = loadThemeTokens();
    const themes: Array<'light' | 'dark'> = ['light', 'dark'];

    for (const theme of themes) {
      const bg = resolve(theme, '--pill-most-affected-bg');
      const text = resolve(theme, '--pill-most-affected-text');

      expect(bg).toBeTruthy();
      expect(text).toBeTruthy();

      const contrast = getContrastRatio(text, bg);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('2. the card renders the "+N more connections" text for 24 modules', () => {
    const dummyNodes: GraphNode[] = [
      {
        id: 'proj-1',
        project_id: 'proj-1',
        scan_id: 'scan-1',
        type: 'project',
        level: 1,
        parent_id: null,
        label: 'test-project',
        path: '.',
        line_start: null,
        line_end: null,
        language: null,
        meta_json: null,
        findingCount: 0,
        maxSeverity: null,
      },
    ];

    for (let i = 0; i < 24; i++) {
      dummyNodes.push({
        id: `mod-${i}`,
        project_id: 'proj-1',
        scan_id: 'scan-1',
        type: 'module',
        level: 1,
        parent_id: 'proj-1',
        label: `module-${i}`,
        path: `src/mod${i}`,
        line_start: null,
        line_end: null,
        language: null,
        meta_json: null,
        findingCount: i === 0 ? 3 : 0,
        maxSeverity: i === 0 ? 'high' : null,
      });
    }

    const dummyEdges: GraphEdge[] = [];
    // Create 20 edges between modules
    for (let i = 0; i < 20; i++) {
      dummyEdges.push({
        id: `e-${i}`,
        project_id: 'proj-1',
        scan_id: 'scan-1',
        source_id: `mod-${i}`,
        target_id: `mod-${(i + 5) % 24}`,
        relation: 'imports',
        status: 'resolved',
        confidence: 'confirmed',
        count: i + 1,
        evidence_json: null,
      });
    }

    const graphData: GraphResponseData = {
      nodes: dummyNodes,
      edges: dummyEdges,
      clusters: [],
      shown: 25,
      total: 25,
      level: 1,
      focus: null,
    };

    render(
      <MemoryRouter>
        <ProjectGraphCard graphData={graphData} />
      </MemoryRouter>
    );

    // 20 edges with 24 modules caps at 12 edges, so 8 are hidden
    expect(
      screen.getByText('+8 more connections, see the module list')
    ).toBeInTheDocument();
  });

  it('3. the real capture renders without any chip hidden behind a label', () => {
    const graphData = ((realGraphLevel1 as any).data ??
      realGraphLevel1) as GraphResponseData;
    const layout = computeL1Layout(graphData);

    render(
      <MemoryRouter>
        <ProjectGraphCard graphData={graphData} />
      </MemoryRouter>
    );

    const allNodes = [
      ...(layout.projectNode ? [layout.projectNode] : []),
      ...layout.moduleNodes,
    ];

    // Every rendered edge chip box must not intersect any node label box
    const chipsWithBox = layout.edges.filter((e) => e.chipBox);
    expect(chipsWithBox.length).toBeGreaterThan(0);

    for (const edge of chipsWithBox) {
      for (const node of allNodes) {
        const collides = boxesIntersect(edge.chipBox!, node.labelBox);
        expect(collides).toBe(false);
      }
    }

    // No chip box intersects another chip box
    for (let i = 0; i < chipsWithBox.length; i++) {
      for (let j = i + 1; j < chipsWithBox.length; j++) {
        const collides = boxesIntersect(
          chipsWithBox[i].chipBox!,
          chipsWithBox[j].chipBox!
        );
        expect(collides).toBe(false);
      }
    }
  });

  it('4. the accessible list still lists all modules', () => {
    const dummyNodes: GraphNode[] = [
      {
        id: 'proj-1',
        project_id: 'proj-1',
        scan_id: 'scan-1',
        type: 'project',
        level: 1,
        parent_id: null,
        label: 'proj-root',
        path: '.',
        line_start: null,
        line_end: null,
        language: null,
        meta_json: null,
        findingCount: 0,
        maxSeverity: null,
      },
    ];

    // 26 modules (exceeding 24 cap)
    for (let i = 0; i < 26; i++) {
      dummyNodes.push({
        id: `mod-acc-${i}`,
        project_id: 'proj-1',
        scan_id: 'scan-1',
        type: 'module',
        level: 1,
        parent_id: 'proj-1',
        label: `accessible-mod-${i}`,
        path: `src/mod${i}`,
        line_start: null,
        line_end: null,
        language: null,
        meta_json: null,
        findingCount: i === 0 ? 4 : 0,
        maxSeverity: i === 0 ? 'critical' : null,
      });
    }

    const graphData: GraphResponseData = {
      nodes: dummyNodes,
      edges: [],
      clusters: [],
      shown: 27,
      total: 27,
      level: 1,
      focus: null,
    };

    render(
      <MemoryRouter>
        <ProjectGraphCard graphData={graphData} />
      </MemoryRouter>
    );

    // Summary heading lists total (26)
    const summary = screen.getByText('Accessible module list (26)');
    expect(summary).toBeInTheDocument();

    const details = summary.closest('details')!;
    expect(details).toBeInTheDocument();

    // All 26 modules are listed inside the accessible details container
    for (let i = 0; i < 26; i++) {
      expect(
        within(details).getByRole('button', {
          name: new RegExp(`^accessible-mod-${i}\\b`),
        })
      ).toBeInTheDocument();
    }
  });

  it('5. applies CSS text truncation with ellipsis on Overview card project label when exceeding 26 chars', () => {
    const longProjectName = 'conduit-realworld-example-app-main'; // 34 characters
    expect(longProjectName.length).toBeGreaterThan(26);

    const dummyNodes: GraphNode[] = [
      {
        id: 'proj-long',
        project_id: 'proj-long',
        scan_id: 'scan-1',
        type: 'project',
        level: 1,
        parent_id: null,
        label: longProjectName,
        path: '.',
        line_start: null,
        line_end: null,
        language: null,
        meta_json: null,
        findingCount: 0,
        maxSeverity: null,
      },
    ];

    // Add 8 radial module pills
    for (let i = 0; i < 8; i++) {
      dummyNodes.push({
        id: `mod-${i}`,
        project_id: 'proj-long',
        scan_id: 'scan-1',
        type: 'module',
        level: 1,
        parent_id: 'proj-long',
        label: `module-${i}`,
        path: `src/mod${i}`,
        line_start: null,
        line_end: null,
        language: null,
        meta_json: null,
        findingCount: 1,
        maxSeverity: 'medium',
      });
    }

    const graphData: GraphResponseData = {
      nodes: dummyNodes,
      edges: [],
      clusters: [],
      shown: 9,
      total: 9,
      level: 1,
      focus: null,
    };

    // 1. Check pure layout clearance: labelBox width clamped to 26 characters
    const layout = computeL1Layout(graphData);
    expect(layout.projectNode).toBeDefined();
    // 26 characters * 6.2 + 6 = 167px (unclamped 34 chars would be 217px)
    expect(layout.projectNode!.labelBox.width).toBeLessThanOrEqual(168);

    // Bounding box does not intersect ANY module label box
    for (const mod of layout.moduleNodes) {
      expect(boxesIntersect(layout.projectNode!.labelBox, mod.labelBox)).toBe(false);
    }

    // 2. Render ProjectGraphCard and verify CSS truncation classes & styles
    render(
      <MemoryRouter>
        <ProjectGraphCard graphData={graphData} />
      </MemoryRouter>
    );

    const projectLabel = screen.getByTestId('overview-project-label');
    expect(projectLabel).toBeInTheDocument();
    expect(projectLabel).toHaveClass('truncate');
    expect(projectLabel).toHaveStyle({
      textOverflow: 'ellipsis',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
    });
    expect(projectLabel).toHaveAttribute('title', longProjectName);
    expect(projectLabel).toHaveTextContent(longProjectName);
  });
});
