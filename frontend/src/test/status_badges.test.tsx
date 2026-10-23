import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge } from '../components/ui/SeverityBadge.js';
import { ConfidenceBadge } from '../components/ui/ConfidenceBadge.js';
import { VerificationBadge } from '../components/ui/VerificationBadge.js';
import type { FindingSeverity, FindingConfidence, FindingVerification } from '../../../shared/types.js';

describe('Status Badges', () => {
  describe('SeverityBadge', () => {
    const severities: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'unknown'];

    it.each(severities)('renders text label and icon for severity "%s"', (severity) => {
      const { container } = render(<SeverityBadge severity={severity} />);
      const badge = screen.getByTestId(`severity-badge-${severity}`);
      expect(badge).toBeInTheDocument();

      // Check text label exists
      const expectedLabels: Record<FindingSeverity, string> = {
        critical: 'Critical',
        high: 'High',
        medium: 'Medium',
        low: 'Low',
        unknown: 'Unknown',
      };
      expect(badge).toHaveTextContent(expectedLabels[severity]);

      // Check SVG icon exists
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('ConfidenceBadge', () => {
    const confidences: FindingConfidence[] = ['confirmed', 'likely', 'hypothesis'];

    it.each(confidences)('renders text label and icon for confidence "%s"', (confidence) => {
      const { container } = render(<ConfidenceBadge confidence={confidence} />);
      const badge = screen.getByTestId(`confidence-badge-${confidence}`);
      expect(badge).toBeInTheDocument();

      const expectedLabels: Record<FindingConfidence, string> = {
        confirmed: 'Confirmed',
        likely: 'Likely',
        hypothesis: 'Hypothesis',
      };
      expect(badge).toHaveTextContent(expectedLabels[confidence]);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('VerificationBadge', () => {
    const verifications: FindingVerification[] = [
      'not_tested',
      'reproduced',
      'fix_proposed',
      'fix_verified',
    ];

    it.each(verifications)('renders text label and icon for verification "%s"', (verification) => {
      const { container } = render(<VerificationBadge verification={verification} />);
      const badge = screen.getByTestId(`verification-badge-${verification}`);
      expect(badge).toBeInTheDocument();

      const expectedLabels: Record<FindingVerification, string> = {
        not_tested: 'Not tested',
        reproduced: 'Reproduced',
        fix_proposed: 'Fix proposed',
        fix_verified: 'Fix verified',
      };
      expect(badge).toHaveTextContent(expectedLabels[verification]);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('specifically renders "Fix verified" with check icon and text', () => {
      const { container } = render(<VerificationBadge verification="fix_verified" />);
      const badge = screen.getByTestId('verification-badge-fix_verified');
      expect(badge).toHaveTextContent('Fix verified');

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      // Check that lucide-check class is present or path has check shape
      expect(svg).toHaveClass('lucide-check');
    });
  });
});
