import { describe, it, expect } from 'vitest';
import {
  responseToFlow,
  calculateElkLayout,
  buildElkInput,
} from '../features/graph/graphTransform.js';
import type { GraphResponseData } from '../../../shared/types.js';

import graphLevel1Fixture from './fixtures/api/graph_level1.json';
import graphLevel2FeesFixture from './fixtures/api/graph_level2_fees.json';
import graphLevel2NoticesFixture from './fixtures/api/graph_level2_notices.json';

interface Box {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function checkNodeOverlaps(
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
  sizeMap: Map<string, { width: number; height: number }>
) {
  const boxes: Box[] = nodes.map((n) => {
    const size = sizeMap.get(n.id) || { width: 220, height: 72 };
    return {
      id: n.id,
      left: n.position.x,
      right: n.position.x + size.width,
      top: n.position.y,
      bottom: n.position.y + size.height,
    };
  });

  const overlaps: Array<{ a: string; b: string; xOverlap: number; yOverlap: number }> = [];

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];

      const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

      // Overlap occurs only when both horizontal and vertical intersections are strictly positive
      if (xOverlap > 0 && yOverlap > 0) {
        overlaps.push({
          a: a.id,
          b: b.id,
          xOverlap,
          yOverlap,
        });
      }
    }
  }

  return overlaps;
}

describe('Graph Layout Node Overlap Prevention (Step 13b-1 Fix 1)', () => {
  it('Level 1 layout: no two node rectangles overlap, specifically root project and fees module', async () => {
    const data = graphLevel1Fixture.data as unknown as GraphResponseData;
    const { flowNodes, flowEdges } = responseToFlow(data);

    const elkInput = buildElkInput(flowNodes, flowEdges);
    const sizeMap = new Map(elkInput.children.map((c) => [c.id, { width: c.width, height: c.height }]));

    const { positionedNodes, layoutSuccess } = await calculateElkLayout(flowNodes, flowEdges);
    expect(layoutSuccess).toBe(true);
    expect(positionedNodes.length).toBe(flowNodes.length);

    const overlaps = checkNodeOverlaps(positionedNodes, sizeMap);
    expect(overlaps).toEqual([]);

    // Specific verification of root node demo-erp vs fees module node
    const rootNode = positionedNodes.find((n) => n.data.nodeType === 'project');
    const feesNode = positionedNodes.find((n) => n.data.label === 'fees');
    expect(rootNode).toBeDefined();
    expect(feesNode).toBeDefined();

    const rootSize = sizeMap.get(rootNode!.id)!;
    const feesSize = sizeMap.get(feesNode!.id)!;

    const rootRight = rootNode!.position.x + rootSize.width;
    const feesLeft = feesNode!.position.x;
    const rootBottom = rootNode!.position.y + rootSize.height;
    const feesTop = feesNode!.position.y;

    // Either horizontally disjoint or vertically disjoint with positive clearance
    const isHorizontallyDisjoint = rootRight <= feesLeft || feesNode!.position.x + feesSize.width <= rootNode!.position.x;
    const isVerticallyDisjoint = rootBottom <= feesTop || feesNode!.position.y + feesSize.height <= rootNode!.position.y;
    expect(isHorizontallyDisjoint || isVerticallyDisjoint).toBe(true);
  });

  it('Level 2 layout (fees & notices captures): zero overlapping node bounding boxes', async () => {
    for (const fixture of [graphLevel2FeesFixture, graphLevel2NoticesFixture]) {
      const data = fixture.data as unknown as GraphResponseData;
      const { flowNodes, flowEdges } = responseToFlow(data);

      const elkInput = buildElkInput(flowNodes, flowEdges);
      const sizeMap = new Map(elkInput.children.map((c) => [c.id, { width: c.width, height: c.height }]));

      const { positionedNodes, layoutSuccess } = await calculateElkLayout(flowNodes, flowEdges);
      expect(layoutSuccess).toBe(true);

      const overlaps = checkNodeOverlaps(positionedNodes, sizeMap);
      expect(overlaps).toEqual([]);
    }
  });

  it('size given to elk in buildElkInput is not smaller than rendered CSS node size', () => {
    const data = graphLevel1Fixture.data as unknown as GraphResponseData;
    const { flowNodes, flowEdges } = responseToFlow(data);
    const elkInput = buildElkInput(flowNodes, flowEdges);

    for (const child of elkInput.children) {
      const flowNode = flowNodes.find((n) => n.id === child.id)!;
      if (flowNode.type === 'clusterNode') {
        expect(child.width).toBeGreaterThanOrEqual(220);
        expect(child.height).toBeGreaterThanOrEqual(80);
      } else if (flowNode.type === 'stubNode') {
        expect(child.width).toBeGreaterThanOrEqual(180);
        expect(child.height).toBeGreaterThanOrEqual(56);
      } else {
        // CustomNode has w-[220px] and min height 72px (80px if focused)
        expect(child.width).toBeGreaterThanOrEqual(220);
        expect(child.height).toBeGreaterThanOrEqual(72);
      }
    }
  });
});
