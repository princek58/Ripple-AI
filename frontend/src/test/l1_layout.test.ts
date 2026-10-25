import { describe, it, expect } from 'vitest';
import {
  computeL1Layout,
  boxesIntersect,
  pointInBox,
  pointInCircle,
  type L1LayoutResult,
} from '../features/overview/l1Layout.js';
import type { GraphResponseData, GraphNode, GraphEdge } from '../../../shared/types.js';
import realLevel1Fixture from './fixtures/api/graph_level1.json';

function makeSyntheticL1Graph(moduleCount: number, edgeCount: number): GraphResponseData {
  const nodes: GraphNode[] = [
    {
      id: 'proj-1',
      project_id: 'proj-1',
      scan_id: 'scan-1',
      type: 'project',
      level: 1,
      parent_id: null,
      label: 'test-project',
      path: '/',
      line_start: null,
      line_end: null,
      language: null,
      meta_json: null,
      findingCount: 10,
      maxSeverity: 'high',
    },
  ];

  for (let i = 0; i < moduleCount; i++) {
    nodes.push({
      id: `mod-${i}`,
      project_id: 'proj-1',
      scan_id: 'scan-1',
      type: 'module',
      level: 1,
      parent_id: 'proj-1',
      label: `m${i}`,
      path: `module:${i}`,
      line_start: null,
      line_end: null,
      language: null,
      meta_json: null,
      findingCount: i === 0 ? 5 : (i % 3),
      maxSeverity: i === 0 ? 'high' : 'low',
    });
  }

  const edges: GraphEdge[] = [];
  let eId = 0;
  for (let stride = 1; stride <= Math.floor(moduleCount / 2); stride++) {
    for (let i = 0; i < moduleCount; i += 2) {
      if (edges.length >= edgeCount) break;
      const target = (i + stride) % moduleCount;
      if (target !== i) {
        edges.push({
          id: `e-${eId++}`,
          project_id: 'proj-1',
          scan_id: 'scan-1',
          source_id: `mod-${i}`,
          target_id: `mod-${target}`,
          relation: 'imports',
          status: 'resolved',
          confidence: 'confirmed',
          count: (eId % 5) + 1,
          evidence_json: null,
        });
      }
    }
  }

  return {
    nodes,
    edges,
    clusters: [],
    shown: nodes.length,
    total: nodes.length,
    level: 1,
    focus: null,
  };
}

function verifyLayoutGeometry(result: L1LayoutResult) {
  // 1. Separation between ring and label >= 4 px for most affected module
  const mostAffected = result.moduleNodes.find((m) => m.isMostAffected);
  if (mostAffected && mostAffected.ringRadius) {
    const ringBottom = mostAffected.pos.y + 28;
    const labelTop = mostAffected.labelBox.y;
    expect(labelTop - ringBottom).toBeGreaterThanOrEqual(4);
  }

  // 2. Chip boxes: no intersection with any label box or any other chip box
  const allLabels = [
    ...(result.projectNode ? [result.projectNode.labelBox] : []),
    ...result.moduleNodes.map((m) => m.labelBox),
  ];

  for (let i = 0; i < result.edges.length; i++) {
    const eA = result.edges[i];
    if (!eA.chipBox) continue;

    for (const lBox of allLabels) {
      expect(boxesIntersect(eA.chipBox, lBox)).toBe(false);
    }

    for (let j = i + 1; j < result.edges.length; j++) {
      const eB = result.edges[j];
      if (eB.chipBox) {
        expect(boxesIntersect(eA.chipBox, eB.chipBox)).toBe(false);
      }
    }
  }

  // 3. Sample every edge path at 40 points
  for (const e of result.edges) {
    const sNode = result.moduleNodes.find((m) => m.id === e.sourceId);
    const tNode = result.moduleNodes.find((m) => m.id === e.targetId);
    expect(sNode).toBeDefined();
    expect(tNode).toBeDefined();
    if (!sNode || !tNode) continue;

    const sPos = sNode.pos;
    const tPos = tNode.pos;
    const c = e.controlPoint;

    for (let k = 0; k < 40; k++) {
      const t = k / 39;
      const px = (1 - t) ** 2 * sPos.x + 2 * (1 - t) * t * c.x + t ** 2 * tPos.x;
      const py = (1 - t) ** 2 * sPos.y + 2 * (1 - t) * t * c.y + t ** 2 * tPos.y;

      // May not fall inside project circle
      expect(pointInCircle(px, py, result.centerX, result.centerY, 28)).toBe(false);

      // May not fall inside any other module circle
      for (const m of result.moduleNodes) {
        if (m.id !== e.sourceId && m.id !== e.targetId) {
          expect(pointInCircle(px, py, m.pos.x, m.pos.y, m.radius)).toBe(false);
        }
      }

      // May not fall inside project label box
      if (result.projectNode) {
        expect(pointInBox(px, py, result.projectNode.labelBox)).toBe(false);
      }

      // May not fall inside any module label box
      for (const m of result.moduleNodes) {
        expect(pointInBox(px, py, m.labelBox)).toBe(false);
      }
    }
  }
}

describe('Level 1 Pure Layout & Geometry (UI-1 Part 1)', () => {
  it('1. real capture fixture: samples never touch node circles or label boxes, chips do not collide, ring separated from label >= 4px', () => {
    const graphData = realLevel1Fixture.data as unknown as GraphResponseData;
    const result = computeL1Layout(graphData);

    expect(result.moduleNodes).toHaveLength(5);
    expect(result.edges.length).toBeGreaterThan(0);
    verifyLayoutGeometry(result);
  });

  it('2. synthetic 6 modules with dense edges: 40 samples per edge never intersect forbidden areas', () => {
    const g6 = makeSyntheticL1Graph(6, 12);
    const result = computeL1Layout(g6);

    expect(result.moduleNodes).toHaveLength(6);
    expect(result.hiddenEdgesCount).toBe(0);
    verifyLayoutGeometry(result);
  });

  it('3. synthetic 10 modules with dense edges: 40 samples per edge never intersect forbidden areas', () => {
    const g10 = makeSyntheticL1Graph(10, 20);
    const result = computeL1Layout(g10);

    expect(result.moduleNodes).toHaveLength(10);
    expect(result.hiddenEdgesCount).toBe(0);
    verifyLayoutGeometry(result);
  });

  it('4. synthetic 24 modules with dense edges: caps edges at 12 and samples never intersect forbidden areas', () => {
    const g24 = makeSyntheticL1Graph(24, 30);
    const result = computeL1Layout(g24);

    expect(result.moduleNodes).toHaveLength(24);
    expect(result.edges).toHaveLength(12);
    expect(result.hiddenEdgesCount).toBe(18);
    verifyLayoutGeometry(result);
  });

  it('5. determinism: identical graph input produces identical layout output', () => {
    const g10 = makeSyntheticL1Graph(10, 15);
    const result1 = computeL1Layout(g10);
    const result2 = computeL1Layout(g10);

    expect(result1).toEqual(result2);
  });

  it('6. edge capping and hidden-edge count: >10 modules caps at 12 strongest edges by count', () => {
    const g12 = makeSyntheticL1Graph(12, 25);
    const result = computeL1Layout(g12);

    expect(result.edges).toHaveLength(12);
    expect(result.hiddenEdgesCount).toBe(13); // 25 - 12 = 13

    // Verify edges are sorted descending by count
    for (let i = 0; i < result.edges.length - 1; i++) {
      expect((result.edges[i].count ?? 0)).toBeGreaterThanOrEqual(result.edges[i + 1].count ?? 0);
    }
  });

  it('7. module overflow count: more than 24 modules caps displayed modules at 24 and returns overflowModulesCount', () => {
    const g26 = makeSyntheticL1Graph(26, 5);
    const result = computeL1Layout(g26);

    expect(result.moduleNodes).toHaveLength(24);
    expect(result.overflowModulesCount).toBe(2);
  });
});
