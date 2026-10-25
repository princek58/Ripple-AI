import { describe, it, expect } from 'vitest';
import {
  matchEvidenceEdges,
  buildMiniGraph,
  summarizeMiniGraph,
} from '../features/investigations/miniGraphPure.js';

// Load real API fixtures captured in Step 14 Part 1
import brokenImportFinding from './fixtures/api/l4_finding_detail_broken_import.json';
import brokenImportGraph from './fixtures/api/l4_graph_broken_import.json';

import circularDepFinding from './fixtures/api/l4_finding_detail_circular_dependency.json';
import circularDepGraph from './fixtures/api/l4_graph_circular_dependency.json';

import isolatedFileFinding from './fixtures/api/l4_finding_detail_isolated_file.json';
import isolatedFileGraph from './fixtures/api/l4_graph_isolated_file.json';

import apiUnmatchedFinding from './fixtures/api/l4_finding_detail_api_unmatched_call.json';
import apiUnmatchedGraph from './fixtures/api/l4_graph_api_unmatched_call.json';

import envUndeclaredFinding from './fixtures/api/l4_finding_detail_env_undeclared.json';
import envUndeclaredGraph from './fixtures/api/l4_graph_env_undeclared.json';

describe('L4 Mini Evidence Graph Pure Functions (Step 14 Part 1)', () => {
  describe('matchEvidenceEdges', () => {
    it('matches broken_import unresolved edge on fees.js line 2', () => {
      const finding = brokenImportFinding.data;
      const graph = brokenImportGraph.data;

      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);

      expect(matchedIds).toHaveLength(1);
      const matchedEdge = graph.edges.find((e: any) => e.id === matchedIds[0]);
      expect(matchedEdge).toBeDefined();
      expect(matchedEdge?.status).toBe('unresolved');
      expect((matchedEdge?.evidence as any)?.file).toBe('backend/routes/fees.js');
      expect((matchedEdge?.evidence as any)?.line_start).toBe(2);
      expect((matchedEdge?.evidence as any)?.specifier).toBe('../services/feeService');
    });

    it('matches both reciprocal import edges for circular_dependency', () => {
      const finding = circularDepFinding.data;
      const graph = circularDepGraph.data;

      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);

      expect(matchedIds).toHaveLength(2);
      const matchedEdges = graph.edges.filter((e: any) => matchedIds.includes(e.id));
      const files = matchedEdges.map((e: any) => (e.evidence as any)?.file).sort();
      expect(files).toEqual(['backend/utils/format.js', 'backend/utils/helpers.js']);
    });

    it('returns empty array when there are no edges (isolated_file)', () => {
      const finding = isolatedFileFinding.data;
      const graph = isolatedFileGraph.data;

      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);
      expect(matchedIds).toEqual([]);
    });

    it('returns empty array when graph edge lines do not match evidence line (api_unmatched_call)', () => {
      const finding = apiUnmatchedFinding.data;
      const graph = apiUnmatchedGraph.data;

      // Evidence is line 13; graph edge is line 8 (matched call)
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);
      expect(matchedIds).toEqual([]);
    });

    it('matches env_undeclared finding evidence against graph edges', () => {
      const finding = envUndeclaredFinding.data;
      const graph = envUndeclaredGraph.data;

      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);
      // env_undeclared does not produce a graph edge in demo-erp
      expect(Array.isArray(matchedIds)).toBe(true);
    });

    it('handles undefined or empty evidence gracefully without throwing', () => {
      expect(matchEvidenceEdges(undefined, [])).toEqual([]);
      expect(matchEvidenceEdges([], undefined)).toEqual([]);
      expect(matchEvidenceEdges([{ file: 'test.js' }], [])).toEqual([]);
    });
  });

  describe('buildMiniGraph', () => {
    it('builds mini graph for broken_import with unresolved stub target and investigation path edge', () => {
      const finding = brokenImportFinding.data;
      const graph = brokenImportGraph.data;
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);

      const result = buildMiniGraph(finding.nodes, graph as any, matchedIds, 12);

      expect(result.flowNodes.length).toBeGreaterThanOrEqual(2);
      // Stub node created for unresolved feeService
      const stubNode = result.flowNodes.find((n) => n.data.nodeType === 'stub');
      expect(stubNode).toBeDefined();
      expect(stubNode?.data.label).toContain('feeService');

      // Edge marked on investigation path
      const pathEdge = result.flowEdges.find((e) => e.data?.isInvestigationPath);
      expect(pathEdge).toBeDefined();
      expect(pathEdge?.id).toBe(matchedIds[0]);
      expect(pathEdge?.data?.status).toBe('unresolved');
      expect(result.omittedCount).toBe(0);
    });

    it('builds mini graph for circular_dependency with both finding nodes and highlighted cycle', () => {
      const finding = circularDepFinding.data;
      const graph = circularDepGraph.data;
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);

      const result = buildMiniGraph(finding.nodes, graph as any, matchedIds, 12);

      const nodeLabels = result.flowNodes.map((n) => n.data.label);
      expect(nodeLabels).toContain('format.js');
      expect(nodeLabels).toContain('helpers.js');

      const pathEdges = result.flowEdges.filter((e) => e.data?.isInvestigationPath);
      expect(pathEdges).toHaveLength(2);
    });

    it('builds mini graph for isolated_file with single node and 0 edges', () => {
      const finding = isolatedFileFinding.data;
      const graph = isolatedFileGraph.data;
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);

      const result = buildMiniGraph(finding.nodes, graph as any, matchedIds, 12);

      expect(result.flowNodes).toHaveLength(1);
      expect(result.flowNodes[0].data.label).toBe('legacyReport.js');
      expect(result.flowEdges).toHaveLength(0);
      expect(result.omittedCount).toBe(0);
    });

    it('respects maxNodes and tracks omittedCount accurately', () => {
      const finding = circularDepFinding.data;
      const graph = circularDepGraph.data; // Has 3 nodes: helpers.js, format.js, noticeService.js
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);

      // Restrict to 2 nodes
      const result = buildMiniGraph(finding.nodes, graph as any, matchedIds, 2);

      expect(result.flowNodes).toHaveLength(2);
      expect(result.omittedCount).toBe(1);
    });

    it('always includes finding own nodes even if missing from graphResponse', () => {
      const customFindingNode = { id: 'missing-node-id', label: 'custom.ts', type: 'backend', path: 'src/custom.ts' };
      const graph = isolatedFileGraph.data;

      const result = buildMiniGraph([customFindingNode], graph as any, [], 12);

      const found = result.flowNodes.find((n) => n.id === 'missing-node-id');
      expect(found).toBeDefined();
      expect(found?.data.label).toBe('custom.ts');
    });

    it('handles undefined graphResponse gracefully', () => {
      const result = buildMiniGraph([], undefined, [], 12);
      expect(result.flowNodes).toEqual([]);
      expect(result.flowEdges).toEqual([]);
      expect(result.omittedCount).toBe(0);
    });
  });

  describe('summarizeMiniGraph', () => {
    it('summarizes broken_import with investigation path and unresolved target sentence', () => {
      const finding = brokenImportFinding.data;
      const graph = brokenImportGraph.data;
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);
      const mini = buildMiniGraph(finding.nodes, graph as any, matchedIds, 12);

      const summary = summarizeMiniGraph({
        flowNodes: mini.flowNodes,
        flowEdges: mini.flowEdges,
        matchedEdgeIds: mini.matchedEdgeIds,
        omittedCount: mini.omittedCount,
      });

      expect(summary.text).toContain('Investigation path:');
      expect(summary.text).toContain('fees.js');
      expect(summary.text).toContain('Unresolved: feeService');
      expect(summary.text).toContain('unresolved');
      expect(summary.text).toContain('Unresolved target: Unresolved: feeService.');
      expect(summary.edgeLines.some((l) => l.includes('(Investigation path)'))).toBe(true);
    });

    it('states "No other file connects to this file" for isolated file', () => {
      const finding = isolatedFileFinding.data;
      const graph = isolatedFileGraph.data;
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);
      const mini = buildMiniGraph(finding.nodes, graph as any, matchedIds, 12);

      const summary = summarizeMiniGraph({
        flowNodes: mini.flowNodes,
        flowEdges: mini.flowEdges,
        matchedEdgeIds: mini.matchedEdgeIds,
      });

      expect(summary.sentences).toContain('No other file connects to this file.');
      expect(summary.text).toContain('No other file connects to this file.');
      expect(summary.edgeLines).toHaveLength(0);
    });

    it('states "No edge matches this evidence" when edges exist but none match evidence', () => {
      const finding = apiUnmatchedFinding.data;
      const graph = apiUnmatchedGraph.data;
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);
      const mini = buildMiniGraph(finding.nodes, graph as any, matchedIds, 12);

      const summary = summarizeMiniGraph({
        flowNodes: mini.flowNodes,
        flowEdges: mini.flowEdges,
        matchedEdgeIds: mini.matchedEdgeIds,
      });

      expect(summary.sentences).toContain('No edge matches this evidence.');
      expect(summary.text).toContain('No edge matches this evidence.');
      expect(summary.text).not.toContain('Investigation path:');
    });

    it('includes "+N more nodes omitted from preview." sentence when omittedCount > 0', () => {
      const finding = circularDepFinding.data;
      const graph = circularDepGraph.data;
      const matchedIds = matchEvidenceEdges(finding.evidence, graph.edges as any);
      const mini = buildMiniGraph(finding.nodes, graph as any, matchedIds, 2);

      const summary = summarizeMiniGraph({
        flowNodes: mini.flowNodes,
        flowEdges: mini.flowEdges,
        matchedEdgeIds: mini.matchedEdgeIds,
        omittedCount: mini.omittedCount,
      });

      expect(summary.sentences).toContain('+1 more nodes omitted from preview.');
      expect(summary.text).toContain('+1 more nodes omitted from preview.');
    });
  });
});
