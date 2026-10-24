import { describe, it, expect } from 'vitest';
import { isNeverScanned } from '../lib/scanState.js';
import type { Project, ProjectSummary } from '../../../shared/types.js';

describe('isNeverScanned helper', () => {
  it('returns false when project is null or undefined', () => {
    expect(isNeverScanned(null)).toBe(false);
    expect(isNeverScanned(undefined)).toBe(false);
  });

  it('returns true when summary has counts.nodes === 0, even if last_scan_at is set', () => {
    const project: Project = {
      id: 'p1',
      name: 'unscanned',
      created_at: '2026-10-24T10:00:00.000Z',
      last_scan_at: '2026-10-24T10:00:00.000Z',
      size_bytes: 1000,
      file_count: 5,
      languages: ['TypeScript'],
    };
    const summary: Partial<ProjectSummary> = {
      counts: {
        nodes: 0,
        edges: 0,
        unresolvedEdges: 0,
        files: 5,
      },
    };

    expect(isNeverScanned(project, summary as ProjectSummary)).toBe(true);
  });

  it('returns false when summary has counts.nodes > 0', () => {
    const project: Project = {
      id: 'p1',
      name: 'scanned',
      created_at: '2026-10-24T10:00:00.000Z',
      last_scan_at: '2026-10-24T10:05:00.000Z',
      size_bytes: 1000,
      file_count: 5,
      languages: ['TypeScript'],
    };
    const summary: Partial<ProjectSummary> = {
      counts: {
        nodes: 12,
        edges: 15,
        unresolvedEdges: 0,
        files: 5,
      },
    };

    expect(isNeverScanned(project, summary as ProjectSummary)).toBe(false);
  });

  it('falls back to !project.last_scan_at when summary is omitted', () => {
    const unscannedProject: Project = {
      id: 'p1',
      name: 'unscanned',
      created_at: '2026-10-24T10:00:00.000Z',
      last_scan_at: null,
      size_bytes: 1000,
      file_count: 5,
      languages: ['TypeScript'],
    };
    const scannedProject: Project = {
      id: 'p2',
      name: 'scanned',
      created_at: '2026-10-24T10:00:00.000Z',
      last_scan_at: '2026-10-24T10:05:00.000Z',
      size_bytes: 1000,
      file_count: 5,
      languages: ['TypeScript'],
    };

    expect(isNeverScanned(unscannedProject)).toBe(true);
    expect(isNeverScanned(scannedProject)).toBe(false);
  });
});
