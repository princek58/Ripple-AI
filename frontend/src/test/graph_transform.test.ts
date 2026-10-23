import { describe, it, expect } from 'vitest';
import {
  responseToFlow,
  extractStubName,
  buildElkInput,
  parseGraphUrl,
  buildGraphUrl,
  resolveLevelFromNodeType,
  buildBreadcrumb,
  isGraphApiError,
} from '../features/graph/graphTransform.js';
import type {
  GraphResponseData,
  NodeDetailsData,
  ApiError,
} from '../../../shared/types.js';

// Real captured fixtures
import graphLevel1Fixture from './fixtures/api/graph_level1.json';
import graphLevel2FeesFixture from './fixtures/api/graph_level2_fees.json';
import graphLevel2NoticesFixture from './fixtures/api/graph_level2_notices.json';
import graphLevel3NoticesD1Fixture from './fixtures/api/graph_level3_notices_d1.json';
import graphLevel3NoticesD2Fixture from './fixtures/api/graph_level3_notices_d2.json';
import graphClusteredL1Fixture from './fixtures/api/graph_clustered_l1.json';
import nodeDetailsFeesFixture from './fixtures/api/node_details_fees.json';
import error400Level2Fixture from './fixtures/api/error_400_level2_no_focus.json';
import error404NodeFixture from './fixtures/api/error_404_node.json';

describe('Graph Pure Functions & Fixture Transformations (Step 11a-1)', () => {
  describe('responseToFlow', () => {
    it('transforms Level 1 graph with nodes and derived edges', () => {
      const graphData = graphLevel1Fixture.data as unknown as GraphResponseData;
      const result = responseToFlow(graphData);

      expect(result.flowNodes).toHaveLength(6);
      expect(result.stubsCount).toBe(0);
      expect(result.clustersCount).toBe(0);
      expect(result.unmappedEdges).toHaveLength(0);

      // Verify node types and finding properties
      const feesNode = result.flowNodes.find((n) => n.data.label === 'fees');
      expect(feesNode).toBeDefined();
      expect(feesNode?.type).toBe('customNode');
      expect(feesNode?.data.nodeType).toBe('module');
      expect(feesNode?.data.findingCount).toBe(2);
      expect(feesNode?.data.maxSeverity).toBe('high');

      // Verify derived edges
      expect(result.flowEdges).toHaveLength(4);
      const derivedEdge = result.flowEdges.find((e) => e.data?.derived);
      expect(derivedEdge).toBeDefined();
      expect(derivedEdge?.data?.count).toBeGreaterThanOrEqual(1);
      expect(derivedEdge?.data?.status).toBe('resolved');
    });

    it('handles unresolved import edges by creating dashed stub nodes', () => {
      const graphData = graphLevel2FeesFixture.data as unknown as GraphResponseData;
      const result = responseToFlow(graphData);

      expect(result.stubsCount).toBe(1);
      expect(result.flowNodes).toHaveLength(3); // 2 real + 1 stub

      const stubNode = result.flowNodes.find((n) => n.type === 'stubNode');
      expect(stubNode).toBeDefined();
      expect(stubNode?.data.label).toBe('Unresolved: feeService');
      expect(stubNode?.data.nodeType).toBe('stub');
      expect(stubNode?.data.specifier).toBe('../services/feeService');

      // Edge targeting the unresolved stub
      const unresolvedEdge = result.flowEdges.find((e) => e.data?.status === 'unresolved');
      expect(unresolvedEdge).toBeDefined();
      expect(unresolvedEdge?.target).toBe(stubNode?.id);
    });

    it('isolates unmapped boundary edges without dropping them', () => {
      const graphData = graphLevel2NoticesFixture.data as unknown as GraphResponseData;
      const result = responseToFlow(graphData);

      // Focused module 'notices' is not in nodes, so boundary edges are unmapped
      expect(result.unmappedEdges).toHaveLength(2);
      expect(result.unmappedEdges[0].id).toContain('boundary:');
      expect(result.unmappedEdges[1].id).toContain('boundary:');

      // Internal edges between existing nodes are mapped
      expect(result.flowEdges.length).toBeGreaterThan(0);
      for (const edge of result.flowEdges) {
        const sourceExists = result.flowNodes.some((n) => n.id === edge.source);
        const targetExists = result.flowNodes.some((n) => n.id === edge.target);
        expect(sourceExists).toBe(true);
        expect(targetExists).toBe(true);
      }
    });

    it('transforms clusters into group nodes with node count', () => {
      const graphData = graphClusteredL1Fixture.data as unknown as GraphResponseData;
      const result = responseToFlow(graphData);

      expect(result.clustersCount).toBe(3); // 1 + 2 nodes in clusters
      const clusterNodes = result.flowNodes.filter((n) => n.type === 'clusterNode');
      expect(clusterNodes).toHaveLength(2);

      const rootCluster = clusterNodes.find((c) => c.data.label === '/');
      expect(rootCluster).toBeDefined();
      expect(rootCluster?.data.clusterCount).toBe(1);

      const modulesCluster = clusterNodes.find((c) => c.data.label === 'modules');
      expect(modulesCluster).toBeDefined();
      expect(modulesCluster?.data.clusterCount).toBe(2);
    });

    it('transforms Level 3 depth 1 and depth 2 graph fixtures', () => {
      const d1Data = graphLevel3NoticesD1Fixture.data as unknown as GraphResponseData;
      const d1Result = responseToFlow(d1Data);
      expect(d1Result.flowNodes).toHaveLength(2);
      expect(d1Result.flowEdges).toHaveLength(1);
      expect(d1Result.flowEdges[0].data?.relation).toBe('calls');

      const d2Data = graphLevel3NoticesD2Fixture.data as unknown as GraphResponseData;
      const d2Result = responseToFlow(d2Data);
      expect(d2Result.flowNodes).toHaveLength(3);
      expect(d2Result.flowEdges).toHaveLength(2);
    });
  });

  describe('extractStubName', () => {
    it('extracts clean filename from path specifiers', () => {
      expect(extractStubName('../services/feeService')).toBe('feeService');
      expect(extractStubName('./NoticePage.tsx')).toBe('NoticePage');
      expect(extractStubName('express')).toBe('express');
      expect(extractStubName('')).toBe('unknown');
    });
  });

  describe('buildElkInput', () => {
    it('produces valid ELK layered graph input structure', () => {
      const graphData = graphLevel2FeesFixture.data as unknown as GraphResponseData;
      const { flowNodes, flowEdges } = responseToFlow(graphData);

      const elkInput = buildElkInput(flowNodes, flowEdges);
      expect(elkInput.id).toBe('root');
      expect(elkInput.layoutOptions['elk.algorithm']).toBe('layered');
      expect(elkInput.layoutOptions['elk.direction']).toBe('RIGHT');

      expect(elkInput.children).toHaveLength(flowNodes.length);
      const stubChild = elkInput.children.find((c) => c.id.startsWith('stub:'));
      expect(stubChild).toBeDefined();
      expect(stubChild?.width).toBe(180);
      expect(stubChild?.height).toBe(56);

      expect(elkInput.edges).toHaveLength(flowEdges.length);
      expect(elkInput.edges[0].sources).toHaveLength(1);
      expect(elkInput.edges[0].targets).toHaveLength(1);
    });
  });

  describe('parseGraphUrl', () => {
    it('safely parses and clamps URL parameters', () => {
      // Full valid parameters
      const sp1 = new URLSearchParams('focus=node-123&level=2&depth=2');
      expect(parseGraphUrl(sp1)).toEqual({
        focus: 'node-123',
        level: 2,
        depth: 2,
      });

      // Focus without level
      const sp2 = new URLSearchParams('focus=node-123');
      expect(parseGraphUrl(sp2)).toEqual({
        focus: 'node-123',
        level: null,
        depth: 1,
      });

      // Bad level and clamped depth
      const sp3 = new URLSearchParams('level=99&depth=10');
      expect(parseGraphUrl(sp3)).toEqual({
        focus: null,
        level: null,
        depth: 3,
      });

      // Negative depth clamped to 1
      const sp4 = new URLSearchParams('depth=-5');
      expect(parseGraphUrl(sp4)).toEqual({
        focus: null,
        level: null,
        depth: 1,
      });
    });
  });

  describe('buildGraphUrl', () => {
    it('constructs URL with safe level fallback and depth clamping', () => {
      // Empty input falls back to level 1
      expect(buildGraphUrl({})).toBe('/app/graph?level=1');

      // Valid parameters
      expect(
        buildGraphUrl({ focus: 'node-1', level: 2, depth: 1 })
      ).toBe('/app/graph?focus=node-1&level=2');

      // Depth greater than 1 included and clamped
      expect(
        buildGraphUrl({ focus: 'node-1', level: 3, depth: 5 })
      ).toBe('/app/graph?focus=node-1&level=3&depth=3');

      // Invalid level without focus falls back to level 1
      expect(
        buildGraphUrl({ level: 99 as unknown as number })
      ).toBe('/app/graph?level=1');
    });
  });

  describe('resolveLevelFromNodeType', () => {
    it('maps module to level 2 and code nodes to level 3', () => {
      expect(resolveLevelFromNodeType('module')).toEqual({ level: 2, depth: 1 });
      expect(resolveLevelFromNodeType('frontend')).toEqual({ level: 3, depth: 1 });
      expect(resolveLevelFromNodeType('backend')).toEqual({ level: 3, depth: 1 });
      expect(resolveLevelFromNodeType('api')).toEqual({ level: 3, depth: 1 });
      expect(resolveLevelFromNodeType('database')).toEqual({ level: 3, depth: 1 });
      expect(resolveLevelFromNodeType('test')).toEqual({ level: 3, depth: 1 });
    });
  });

  describe('buildBreadcrumb', () => {
    it('builds breadcrumbs from project and node details parentModule', () => {
      const project = { name: 'demo-erp' };
      const details = nodeDetailsFeesFixture.data as unknown as NodeDetailsData;

      // Level 1: Project root
      const crumbsL1 = buildBreadcrumb(project, null, null, 1);
      expect(crumbsL1).toHaveLength(1);
      expect(crumbsL1[0].label).toBe('demo-erp');
      expect(crumbsL1[0].url).toBe('/app/graph?level=1');
      expect(crumbsL1[0].isCurrent).toBe(true);

      // Level 2: Module level
      const crumbsL2 = buildBreadcrumb(
        project,
        details.parentModule,
        { id: 'module-fees', label: 'fees', type: 'module' },
        2
      );
      expect(crumbsL2).toHaveLength(2);
      expect(crumbsL2[0].isCurrent).toBe(false);
      expect(crumbsL2[1].label).toBe('fees');
      expect(crumbsL2[1].isCurrent).toBe(true);

      // Level 3: Code node level with parentModule
      const crumbsL3 = buildBreadcrumb(
        project,
        details.parentModule,
        details.node,
        3
      );
      expect(crumbsL3).toHaveLength(3);
      expect(crumbsL3[0].label).toBe('demo-erp');
      expect(crumbsL3[0].isCurrent).toBe(false);
      expect(crumbsL3[1].label).toBe('fees');
      expect(crumbsL3[1].url).toBe('/app/graph?level=2&focus=57c7c9b2-7b2a-423b-a6b9-016c5a5b81cc');
      expect(crumbsL3[1].isCurrent).toBe(false);
      expect(crumbsL3[2].label).toBe('fees.js');
      expect(crumbsL3[2].url).toBe('/app/graph?level=3&focus=fc7e7bb4-cbfb-4abc-ae1f-18d22a211945&depth=1');
      expect(crumbsL3[2].isCurrent).toBe(true);
    });
  });

  describe('API error fixtures', () => {
    it('verify contract error shapes for 400 and 404 responses', () => {
      const err400 = error400Level2Fixture as unknown as ApiError;
      expect(isGraphApiError(err400)).toBe(true);
      expect(err400.data).toBeNull();
      expect(err400.error).toContain('focus parameter is required');

      const err404 = error404NodeFixture as unknown as ApiError;
      expect(isGraphApiError(err404)).toBe(true);
      expect(err404.data).toBeNull();
      expect(err404.error).toBe('Node not found');

      // Negative check
      expect(isGraphApiError({ data: { nodes: [] }, error: null })).toBe(false);
    });
  });
});
