import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FindingDetail } from '../features/investigations/FindingDetail.js';
import { getHowToFix } from '../features/investigations/howToFix.js';
import type { FindingDetailData } from '../../../shared/types.js';

// Real captures from demo-erp
import brokenImportFixture from './fixtures/api/finding_detail_broken_import.json';
import circularFixture from './fixtures/api/finding_detail_circular_dependency.json';
import envUndeclaredFixture from './fixtures/api/finding_detail_env_undeclared.json';
import apiUnmatchedFixture from './fixtures/api/finding_detail_api_unmatched_call.json';
import isolatedFileFixture from './fixtures/api/finding_detail_isolated_file.json';

const brokenImportDetail = brokenImportFixture.data as unknown as FindingDetailData;
const circularDetail = circularFixture.data as unknown as FindingDetailData;
const envUndeclaredDetail = envUndeclaredFixture.data as unknown as FindingDetailData;
const apiUnmatchedDetail = apiUnmatchedFixture.data as unknown as FindingDetailData;
const isolatedFileDetail = isolatedFileFixture.data as unknown as FindingDetailData;

describe('FindingDetail How To Fix Card (Step 12a-2 Part 2)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('each of the five captured rules shows its own "What this means" text in English', () => {
    const capturedFindings = [
      brokenImportDetail,
      circularDetail,
      envUndeclaredDetail,
      apiUnmatchedDetail,
      isolatedFileDetail,
    ];

    for (const finding of capturedFindings) {
      const { unmount } = render(
        <MemoryRouter>
          <FindingDetail finding={finding} />
        </MemoryRouter>
      );

      const expectedGuidance = getHowToFix(finding.rule_id, 'en');
      expect(
        screen.getByText(expectedGuidance.whatItMeans),
        `English whatItMeans for ${finding.rule_id}`
      ).toBeInTheDocument();

      unmount();
    }
  });

  it('toggling to Hinglish shows Hinglish text for the same finding and choice persists on re-render', () => {
    const { unmount } = render(
      <MemoryRouter>
        <FindingDetail finding={circularDetail} />
      </MemoryRouter>
    );

    const enGuidance = getHowToFix('circular_dependency', 'en');
    const hiGuidance = getHowToFix('circular_dependency', 'hi');

    expect(screen.getByText(enGuidance.whatItMeans)).toBeInTheDocument();

    // Toggle to Hinglish
    const hiButton = screen.getByRole('radio', { name: 'Hinglish' });
    fireEvent.click(hiButton);

    expect(screen.getByText(hiGuidance.whatItMeans)).toBeInTheDocument();
    expect(screen.queryByText(enGuidance.whatItMeans)).not.toBeInTheDocument();

    unmount();

    // Re-render and confirm Hinglish choice persisted from localStorage
    render(
      <MemoryRouter>
        <FindingDetail finding={circularDetail} />
      </MemoryRouter>
    );

    expect(screen.getByText(hiGuidance.whatItMeans)).toBeInTheDocument();
  });

  it('"Template-based, not AI" and the "not run or tested" sentence are always visible', () => {
    render(
      <MemoryRouter>
        <FindingDetail finding={brokenImportDetail} />
      </MemoryRouter>
    );

    expect(screen.getByText('Template-based, not AI')).toBeInTheDocument();
    expect(
      screen.getByText(
        'These steps are written guidance. Ripple AI has not run or tested them.'
      )
    ).toBeInTheDocument();
  });

  it('the "Start here" line shows file:line from the capture and is absent when evidence is empty', () => {
    // 1. With capture containing evidence
    const { unmount } = render(
      <MemoryRouter>
        <FindingDetail finding={apiUnmatchedDetail} />
      </MemoryRouter>
    );

    const startHere = screen.getByTestId('how-to-fix-start-here');
    expect(startHere).toBeInTheDocument();
    expect(startHere).toHaveTextContent('Start here:');
    expect(startHere).toHaveTextContent('frontend/src/pages/NoticePage.tsx:13');

    unmount();

    // 2. Hand-made case with empty evidence
    const emptyEvidenceFinding: FindingDetailData = {
      ...brokenImportDetail,
      evidence: [],
    };

    render(
      <MemoryRouter>
        <FindingDetail finding={emptyEvidenceFinding} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('how-to-fix-start-here')).not.toBeInTheDocument();
  });

  it('the auto-fix note appears for the three rules (env_undeclared, api_unmatched_call, broken_import)', () => {
    const autoFixRules = [brokenImportDetail, envUndeclaredDetail, apiUnmatchedDetail];

    for (const finding of autoFixRules) {
      const { unmount } = render(
        <MemoryRouter>
          <FindingDetail finding={finding} />
        </MemoryRouter>
      );

      const note = screen.getByTestId('how-to-fix-autofix-note');
      expect(note).toBeInTheDocument();
      expect(note).toHaveTextContent(
        'For some cases Ripple AI can suggest a change in Fixes. It is only a suggestion and is never applied automatically.'
      );

      unmount();
    }

    // Isolated file and circular dependency do not have this note
    const nonAutoFixFindings = [circularDetail, isolatedFileDetail];
    for (const finding of nonAutoFixFindings) {
      const { unmount } = render(
        <MemoryRouter>
          <FindingDetail finding={finding} />
        </MemoryRouter>
      );

      expect(screen.queryByTestId('how-to-fix-autofix-note')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('secret note appears for secret_pattern and no secret value is rendered', () => {
    // Hand-made secret finding with file, line, and pattern name only
    const secretFinding: FindingDetailData = {
      ...brokenImportDetail,
      id: 'secret-f-1',
      rule_id: 'secret_pattern',
      title: 'Secret pattern detected in server.js',
      summary: 'A secret pattern was found.',
      evidence: [
        {
          file: 'backend/server.js',
          line_start: 42,
          line_end: 42,
          pattern: 'AWS_SECRET_ACCESS_KEY',
        },
      ],
      nodes: [],
    };

    render(
      <MemoryRouter>
        <FindingDetail finding={secretFinding} />
      </MemoryRouter>
    );

    const secretNote = screen.getByTestId('how-to-fix-secret-note');
    expect(secretNote).toBeInTheDocument();
    expect(secretNote).toHaveTextContent(
      'Ripple AI never builds an automatic fix for secrets.'
    );

    // Assert allowlisted items are present
    expect(screen.getAllByText('backend/server.js:42').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('AWS_SECRET_ACCESS_KEY')).toBeInTheDocument();

    // Guidance text tells user not to paste secrets
    expect(
      screen.getByText('Never paste the secret into this tool, a chat or a ticket.')
    ).toBeInTheDocument();

    // Verify auto-fix note is NOT present
    expect(screen.queryByTestId('how-to-fix-autofix-note')).not.toBeInTheDocument();
  });

  it('an unknown rule id shows the generic text', () => {
    const unknownRuleFinding: FindingDetailData = {
      ...brokenImportDetail,
      rule_id: 'custom_checker_unknown_rule',
    };

    render(
      <MemoryRouter>
        <FindingDetail finding={unknownRuleFinding} />
      </MemoryRouter>
    );

    expect(
      screen.getByText('Ripple AI has no written guidance for this kind of finding yet.')
    ).toBeInTheDocument();
  });

  it('storage failure (localStorage throws) still renders English', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Access denied');
    });

    render(
      <MemoryRouter>
        <FindingDetail finding={brokenImportDetail} />
      </MemoryRouter>
    );

    const enGuidance = getHowToFix('broken_import', 'en');
    expect(screen.getByText(enGuidance.whatItMeans)).toBeInTheDocument();
  });

  it('the language toggle is keyboard operable with arrow keys', () => {
    render(
      <MemoryRouter>
        <FindingDetail finding={circularDetail} />
      </MemoryRouter>
    );

    const enButton = screen.getByRole('radio', { name: 'English' });
    const hiButton = screen.getByRole('radio', { name: 'Hinglish' });

    // Press ArrowRight on English button to switch to Hinglish
    fireEvent.keyDown(enButton, { key: 'ArrowRight' });

    const hiGuidance = getHowToFix('circular_dependency', 'hi');
    expect(screen.getByText(hiGuidance.whatItMeans)).toBeInTheDocument();

    // Press ArrowLeft on Hinglish button to switch back to English
    fireEvent.keyDown(hiButton, { key: 'ArrowLeft' });

    const enGuidance = getHowToFix('circular_dependency', 'en');
    expect(screen.getByText(enGuidance.whatItMeans)).toBeInTheDocument();
  });

  it('the card never claims the finding is fixed or verified and verification badge is preserved', () => {
    render(
      <MemoryRouter>
        <FindingDetail finding={brokenImportDetail} />
      </MemoryRouter>
    );

    // Finding detail renders the exact verification from the capture
    expect(screen.getByTestId('verification-badge-not_tested')).toHaveTextContent(
      'Not tested'
    );

    // No false claims
    expect(screen.queryByText(/this finding is fixed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/this finding is verified/i)).not.toBeInTheDocument();
  });
});
