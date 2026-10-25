import { describe, it, expect } from 'vitest';
import {
  impactRounds,
  impactSentences,
  rippleLayout,
  parseImpactUrl,
  buildImpactUrl,
} from '../features/impact/impactPure.js';
import type { ImpactResult } from '../../../shared/types.js';

import impactNoticeServiceFixture from './fixtures/api/impact_notice_service.json';
import impactLegacyReportZeroFixture from './fixtures/api/impact_legacy_report_zero.json';
import impactMaxNodes3Fixture from './fixtures/api/impact_max_nodes_3.json';

describe('impactPure - Pure Functions for Change Impact (Feature A)', () => {
  describe('impactRounds', () => {
    it('groups real noticeService capture into 3 rounds preserving backend order and plain labels', () => {
      const result = impactNoticeServiceFixture.data as unknown as ImpactResult;
      const rounds = impactRounds(result);

      expect(rounds.length).toBe(3);

      expect(rounds[0].round).toBe(1);
      expect(rounds[0].label).toBe('Round 1: depends directly on it');
      expect(rounds[0].items.map((i) => i.label)).toEqual(['notices.js', 'notices.test.js']);

      expect(rounds[1].round).toBe(2);
      expect(rounds[1].label).toBe('Round 2: depends on round 1');
      expect(rounds[1].items.map((i) => i.label)).toEqual(['GET /api/notices', 'POST /api/notices', 'server.js']);

      expect(rounds[2].round).toBe(3);
      expect(rounds[2].label).toBe('Round 3: depends on round 2');
      expect(rounds[2].items.map((i) => i.label)).toEqual(['NoticePage.tsx']);
    });

    it('returns empty array for zero affected items', () => {
      const result = impactLegacyReportZeroFixture.data as unknown as ImpactResult;
      const rounds = impactRounds(result);
      expect(rounds).toEqual([]);
    });
  });

  describe('impactSentences', () => {
    it('returns between 2 and 5 sentences for noticeService capture with count details', () => {
      const result = impactNoticeServiceFixture.data as unknown as ImpactResult;
      const sentences = impactSentences(result);

      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(5);

      const firstSentence = sentences[0];
      expect(firstSentence).toContain('3 files');
      expect(firstSentence).toContain('2 API endpoints');
      expect(firstSentence).toContain('0 config items');
      expect(firstSentence).toContain('1 test');
      expect(firstSentence).toContain('2 modules');
      expect(firstSentence).toContain('may be affected');
    });

    it('returns exactly "No other file depends on this item." for legacyReport.js zero result', () => {
      const result = impactLegacyReportZeroFixture.data as unknown as ImpactResult;
      const sentences = impactSentences(result);

      expect(sentences).toContain('No other file depends on this item.');
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(5);
    });

    it('includes unresolved nearby warning and possible dependency notices when present', () => {
      const handMade: ImpactResult = {
        start: { id: 's1', label: 'start.js', type: 'backend', path: 'src/start.js', module: 'core' },
        affected: [
          {
            id: 'a1',
            label: 'dyn.js',
            type: 'frontend',
            path: 'src/dyn.js',
            module: 'ui',
            distance: 1,
            certainty: 'possible',
            via: { relation: 'calls', status: 'possible' },
          },
        ],
        counts: { files: 1, api_endpoints: 0, config: 0, tests: 0, modules: 1 },
        by_module: [{ module: 'ui', count: 1 }],
        tests_to_review: [],
        truncated: true,
        unresolved_nearby: 3,
        notes: [],
      };

      const sentences = impactSentences(handMade);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
      expect(sentences.length).toBeLessThanOrEqual(5);

      expect(sentences.some((s) => s.includes('only a possible dependency'))).toBe(true);
      expect(sentences.some((s) => s.includes('3 dynamic or unresolved references touch this area'))).toBe(true);
      expect(sentences.some((s) => s.includes('Results were truncated'))).toBe(true);
    });

    it('handles real truncated fixture impactMaxNodes3Fixture properly', () => {
      const result = impactMaxNodes3Fixture.data as unknown as ImpactResult;
      const sentences = impactSentences(result);
      expect(sentences.some((s) => s.includes('Results were truncated'))).toBe(true);
    });
  });

  describe('rippleLayout', () => {
    it('is strictly deterministic: identical inputs produce identical node coordinates and rings', () => {
      const result = impactNoticeServiceFixture.data as unknown as ImpactResult;
      const layout1 = rippleLayout(result, { nodeRadius: 20 });
      const layout2 = rippleLayout(result, { nodeRadius: 20 });

      expect(layout1).toEqual(layout2);
      expect(layout1.startNode.x).toBe(layout1.center.x);
      expect(layout1.startNode.y).toBe(layout1.center.y);
    });

    it('guarantees no node overlaps: distance between any two node centres is strictly greater than 2 * nodeRadius', () => {
      const result = impactNoticeServiceFixture.data as unknown as ImpactResult;
      const nodeRadius = 24;
      const layout = rippleLayout(result, { nodeRadius });

      const allNodes = [
        layout.startNode,
        ...layout.rings.flatMap((r) => r.nodes),
      ];

      expect(allNodes.length).toBe(7); // 1 start + 6 affected

      for (let i = 0; i < allNodes.length; i++) {
        for (let j = i + 1; j < allNodes.length; j++) {
          const a = allNodes[i];
          const b = allNodes[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          // Distance between centres must be strictly > 2 * nodeRadius
          expect(dist).toBeGreaterThan(nodeRadius * 2);
        }
      }
    });

    it('enforces maxPerRing: 14 cap and reports +N more in round r', () => {
      const hugeRoundItems = Array.from({ length: 25 }, (_, idx) => ({
        id: `node-${idx}`,
        label: `node-${idx}.js`,
        type: 'backend' as const,
        path: `src/node-${idx}.js`,
        module: 'bulk',
        distance: 1,
        certainty: 'proven' as const,
        via: { relation: 'imports' as const, status: 'resolved' as const },
      }));

      const handMade: ImpactResult = {
        start: { id: 's0', label: 'root.js', type: 'backend', path: 'src/root.js', module: 'core' },
        affected: hugeRoundItems,
        counts: { files: 25, api_endpoints: 0, config: 0, tests: 0, modules: 1 },
        by_module: [{ module: 'bulk', count: 25 }],
        tests_to_review: [],
        truncated: false,
        unresolved_nearby: 0,
        notes: [],
      };

      const layout = rippleLayout(handMade, { maxPerRing: 14, nodeRadius: 20 });
      expect(layout.rings.length).toBe(1);
      expect(layout.rings[0].nodes.length).toBe(14);
      expect(layout.rings[0].overflowCount).toBe(11);
      expect(layout.rings[0].overflowText).toBe('+11 more in round 1');
      expect(layout.totalShown).toBe(14);
    });

    it('enforces maxShown: 60 global cap across multiple rings for a 200-item graph', () => {
      const items200 = Array.from({ length: 200 }, (_, idx) => ({
        id: `node-${idx}`,
        label: `node-${idx}.js`,
        type: 'backend' as const,
        path: `src/node-${idx}.js`,
        module: `mod-${Math.floor(idx / 20)}`,
        distance: 1 + Math.floor(idx / 30), // distances 1 to 7
        certainty: 'proven' as const,
        via: { relation: 'imports' as const, status: 'resolved' as const },
      }));

      const handMade: ImpactResult = {
        start: { id: 's0', label: 'root.js', type: 'backend', path: 'src/root.js', module: 'core' },
        affected: items200,
        counts: { files: 200, api_endpoints: 0, config: 0, tests: 0, modules: 10 },
        by_module: [],
        tests_to_review: [],
        truncated: false,
        unresolved_nearby: 0,
        notes: [],
      };

      const layout = rippleLayout(handMade, { maxPerRing: 14, maxShown: 60, nodeRadius: 18 });
      expect(layout.totalShown).toBe(60);
      expect(layout.totalAffected).toBe(200);

      // Verify no overlaps in the 60-node layout
      const allNodes = [layout.startNode, ...layout.rings.flatMap((r) => r.nodes)];
      expect(allNodes.length).toBe(61);
      for (let i = 0; i < allNodes.length; i++) {
        for (let j = i + 1; j < allNodes.length; j++) {
          const dist = Math.hypot(allNodes[i].x - allNodes[j].x, allNodes[i].y - allNodes[j].y);
          expect(dist).toBeGreaterThan(18 * 2);
        }
      }
    });
  });

  describe('parseImpactUrl and buildImpactUrl', () => {
    it('parses valid UUID impact and depth 1..10, dropping invalid values', () => {
      const validUuid = 'c0ed84ae-302c-47e5-909d-4b6702e7dc7a';
      const parsed1 = parseImpactUrl(`?impact=${validUuid}&depth=5`);
      expect(parsed1.impact).toBe(validUuid);
      expect(parsed1.depth).toBe(5);

      // Invalid UUID dropped
      const parsed2 = parseImpactUrl('?impact=not-a-uuid&depth=3');
      expect(parsed2.impact).toBeNull();
      expect(parsed2.depth).toBe(3);

      // Out of bounds depth dropped
      const parsed3 = parseImpactUrl(`?impact=${validUuid}&depth=15`);
      expect(parsed3.impact).toBe(validUuid);
      expect(parsed3.depth).toBeNull();

      const parsed4 = parseImpactUrl(`?impact=${validUuid}&depth=0`);
      expect(parsed4.depth).toBeNull();

      const parsed5 = parseImpactUrl(`?impact=${validUuid}&depth=not-a-number`);
      expect(parsed5.depth).toBeNull();
    });

    it('builds impact URL preserving existing parameters and round-trips correctly', () => {
      const validUuid = 'c0ed84ae-302c-47e5-909d-4b6702e7dc7a';
      const initial = 'focus=11111111-1111-1111-1111-111111111111&level=2';

      const withImpact = buildImpactUrl(initial, { impact: validUuid, depth: 4 });
      expect(withImpact).toContain('focus=11111111-1111-1111-1111-111111111111');
      expect(withImpact).toContain('level=2');
      expect(withImpact).toContain(`impact=${validUuid}`);
      expect(withImpact).toContain('depth=4');

      const parsed = parseImpactUrl(withImpact);
      expect(parsed.impact).toBe(validUuid);
      expect(parsed.depth).toBe(4);

      // Removing impact
      const removed = buildImpactUrl(withImpact, { impact: null, depth: null });
      expect(removed).not.toContain('impact=');
      expect(removed).not.toContain('depth=');
      expect(removed).toContain('focus=');
    });
  });
});
