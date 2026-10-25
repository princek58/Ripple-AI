import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ScanHistoryStrip } from '../features/investigations/ScanHistoryStrip.js';
import { api } from '../lib/api.js';
import scansCapture from './fixtures/api/l4_scans.json';
import type { Scan } from '../../../shared/types.js';

describe('ScanHistoryStrip (Step 14 Part 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading skeleton while scans are loading', () => {
    vi.spyOn(api, 'getScans').mockImplementation(() => new Promise(() => {}));

    render(<ScanHistoryStrip projectId="project-123" />);

    expect(screen.getByTestId('scan-history-loading')).toBeInTheDocument();
  });

  it('renders two scans with real fields: date/time, status icon + text, backend notes, and label', async () => {
    // Two scans from the real fixture
    const twoScans: Scan[] = scansCapture.data.slice(0, 2) as Scan[];
    vi.spyOn(api, 'getScans').mockResolvedValue(twoScans);

    render(<ScanHistoryStrip projectId="project-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('scan-history-strip')).toBeInTheDocument();
    });

    // Label: "Scan history. Timing is a hint, not proof."
    expect(
      screen.getAllByText('Scan history. Timing is a hint, not proof.')[0]
    ).toBeInTheDocument();

    // Two scan items rendered on desktop view in newest-first order
    const renderedItems = screen.getAllByTestId(/^scan-history-item-/);
    expect(renderedItems[0]).toHaveAttribute('data-testid', `scan-history-item-${twoScans[0].id}`);
    expect(renderedItems[1]).toHaveAttribute('data-testid', `scan-history-item-${twoScans[1].id}`);

    // Status as icon plus text
    const completedLabels = screen.getAllByText(/completed/i);
    expect(completedLabels.length).toBeGreaterThanOrEqual(2);

    // Backend notes text
    expect(screen.getAllByText(twoScans[0].notes!)[0]).toBeInTheDocument();

    // Timing count text: "Latest 2 scans"
    expect(screen.getByText('Latest 2 scans')).toBeInTheDocument();
  });

  it('renders exactly one item when only one scan exists', async () => {
    // Exactly one scan
    const oneScan: Scan[] = [scansCapture.data[0] as Scan];
    vi.spyOn(api, 'getScans').mockResolvedValue(oneScan);

    render(<ScanHistoryStrip projectId="project-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('scan-history-strip')).toBeInTheDocument();
    });

    // Renders the single item
    expect(screen.getByTestId(`scan-history-item-${oneScan[0].id}`)).toBeInTheDocument();

    // Notes
    expect(screen.getAllByText(oneScan[0].notes!)[0]).toBeInTheDocument();

    // Text says "1 scan" (singular)
    expect(screen.getByText('Latest 1 scan')).toBeInTheDocument();
  });

  it('does not display zeros when there are no scans', async () => {
    vi.spyOn(api, 'getScans').mockResolvedValue([]);

    const { container } = render(<ScanHistoryStrip projectId="project-123" />);

    await waitFor(() => {
      expect(screen.queryByTestId('scan-history-loading')).not.toBeInTheDocument();
    });

    // Returns null and does not render fake zeros
    expect(screen.queryByTestId('scan-history-strip')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('0');
  });

  it('renders error state with Retry button that retries without blocking the page', async () => {
    const getScansSpy = vi
      .spyOn(api, 'getScans')
      .mockRejectedValueOnce(new Error('Network error on scans'))
      .mockResolvedValueOnce([scansCapture.data[0] as Scan]);

    render(<ScanHistoryStrip projectId="project-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('scan-history-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Network error on scans')).toBeInTheDocument();

    const retryBtn = screen.getByTestId('scan-history-retry');
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('scan-history-strip')).toBeInTheDocument();
    });

    expect(getScansSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('scan-history-error')).not.toBeInTheDocument();
  });

  it('is collapsed to one line on phone width and expands on toggle', async () => {
    const twoScans: Scan[] = scansCapture.data.slice(0, 2) as Scan[];
    vi.spyOn(api, 'getScans').mockResolvedValue(twoScans);

    render(<ScanHistoryStrip projectId="project-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('scan-history-strip')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('scan-history-mobile-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Expand');

    // Initially mobile expanded panel is hidden
    expect(screen.queryByTestId('scan-history-mobile-expanded')).not.toBeInTheDocument();

    // Click expand
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Collapse');
    expect(screen.getByTestId('scan-history-mobile-expanded')).toBeInTheDocument();

    // Click collapse
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('scan-history-mobile-expanded')).not.toBeInTheDocument();
  });
});
