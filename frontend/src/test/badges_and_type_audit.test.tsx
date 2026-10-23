import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from '../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../components/ui/VerificationBadge.js';
import { AffectedModulesStrip } from '../features/overview/AffectedModulesStrip.js';
import type {
  FindingSeverity,
  FindingConfidence,
  FindingVerification,
  NodeDetailsData,
  ProjectSummary,
} from '../../../shared/types.js';

describe('Badges and Enum Type Audit (Step 12a-1 Part 0)', () => {
  it('renders SeverityBadge for EVERY value of FindingSeverity with icon and text', () => {
    const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'unknown'];
    const expectedLabels: Record<FindingSeverity, string> = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      unknown: 'Unknown',
    };

    severities.forEach((sev) => {
      const { unmount } = render(<SeverityBadge severity={sev} />);
      const badge = screen.getByTestId(`severity-badge-${sev}`);
      expect(badge).toBeInTheDocument();
      expect(badge.textContent?.trim()).toBe(expectedLabels[sev]);
      // Verify svg icon is present (never color alone)
      const icon = badge.querySelector('svg');
      expect(icon).toBeInTheDocument();
      unmount();
    });
  });

  it('renders ConfidenceBadge for EVERY value of FindingConfidence with icon and text', () => {
    const confidences: FindingConfidence[] = ['confirmed', 'likely', 'hypothesis'];
    const expectedLabels: Record<FindingConfidence, string> = {
      confirmed: 'Confirmed',
      likely: 'Likely',
      hypothesis: 'Hypothesis',
    };

    confidences.forEach((conf) => {
      const { unmount } = render(<ConfidenceBadge confidence={conf} />);
      const badge = screen.getByTestId(`confidence-badge-${conf}`);
      expect(badge).toBeInTheDocument();
      expect(badge.textContent?.trim()).toBe(expectedLabels[conf]);
      // Verify svg icon is present (never color alone)
      const icon = badge.querySelector('svg');
      expect(icon).toBeInTheDocument();
      unmount();
    });
  });

  it('renders VerificationBadge for EVERY value of FindingVerification with icon and text', () => {
    const verifications: FindingVerification[] = [
      'not_tested',
      'reproduced',
      'fix_proposed',
      'fix_verified',
    ];
    const expectedLabels: Record<FindingVerification, string> = {
      not_tested: 'Not tested',
      reproduced: 'Reproduced',
      fix_proposed: 'Fix proposed',
      fix_verified: 'Fix verified',
    };

    verifications.forEach((ver) => {
      const { unmount } = render(<VerificationBadge verification={ver} />);
      const badge = screen.getByTestId(`verification-badge-${ver}`);
      expect(badge).toBeInTheDocument();
      expect(badge.textContent?.trim()).toBe(expectedLabels[ver]);
      // Verify svg icon is present (never color alone)
      const icon = badge.querySelector('svg');
      expect(icon).toBeInTheDocument();
      unmount();
    });
  });

  it('node-details relatedFindings type accepts confidence "likely" and verification "fix_proposed"', () => {
    // Compile-time & runtime assertion on NodeDetailsData relatedFindings
    const sampleRelatedFinding: NodeDetailsData['relatedFindings'][number] = {
      id: 'finding-likely-proposed',
      title: 'Undeclared environment variable PORT',
      severity: 'medium',
      confidence: 'likely',
      verification: 'fix_proposed',
    };

    expect(sampleRelatedFinding.confidence).toBe('likely');
    expect(sampleRelatedFinding.verification).toBe('fix_proposed');

    // Render badges with likely & fix_proposed
    render(
      <div>
        <SeverityBadge severity={sampleRelatedFinding.severity} size="sm" />
        <ConfidenceBadge confidence={sampleRelatedFinding.confidence} size="sm" />
        <VerificationBadge verification={sampleRelatedFinding.verification} size="sm" />
      </div>
    );
    expect(screen.getByTestId('confidence-badge-likely')).toHaveTextContent('Likely');
    expect(screen.getByTestId('verification-badge-fix_proposed')).toHaveTextContent('Fix proposed');

    // Also assert that affectedModules maxSeverity accepts null or a FindingSeverity
    const moduleWithFindings: ProjectSummary['affectedModules'][number] = {
      moduleId: 'mod-1',
      label: 'fees',
      findingCount: 2,
      maxSeverity: 'high',
    };
    const moduleWithoutFindings: ProjectSummary['affectedModules'][number] = {
      moduleId: 'mod-2',
      label: 'notices',
      findingCount: 0,
      maxSeverity: null,
    };

    expect(moduleWithFindings.maxSeverity).toBe('high');
    expect(moduleWithoutFindings.maxSeverity).toBeNull();

    // Verify AffectedModulesStrip handles null maxSeverity safely without rendering an invalid badge
    const { container: stripContainer } = render(
      <AffectedModulesStrip
        affectedModules={[
          {
            moduleId: 'mod-null',
            label: 'safe-module',
            findingCount: 0,
            maxSeverity: null,
          },
        ]}
      />
    );
    expect(stripContainer.querySelector('[data-testid^="severity-badge-"]')).toBeNull();
  });
});
