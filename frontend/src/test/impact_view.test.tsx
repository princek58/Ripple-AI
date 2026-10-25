import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ImpactView } from '../features/impact/ImpactView.js';
import { NodeDetailsPanel } from '../features/graph/NodeDetailsPanel.js';
import { api, ApiClientError } from '../lib/api.js';

// Real API Fixtures from Part 1
import impactNoticeServiceFixture from './fixtures/api/impact_notice_service.json';
import impactHelpersCircularFixture from './fixtures/api/impact_helpers_circular.json';
import impactLegacyReportZeroFixture from './fixtures/api/impact_legacy_report_zero.json';
import impactApiNoticesFixture from './fixtures/api/impact_api_notices.json';
import impactConfigJwtFixture from './fixtures/api/impact_config_jwt.json';
import nodeDetailsModuleFixture from './fixtures/api/node_details_module.json';
import nodeDetailsFeesFixture from './fixtures/api/node_details_fees.json';
import type { ImpactResult } from '../../../shared/types.js';

describe('Ripple View UI & Impact Tests (Step P2-A2 Part 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('1. noticeService.js shows 6 items in rounds 1, 2 and 3 and the sentence with the counts', async () => {
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactNoticeServiceFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="c0ed84ae-302c-47e5-909d-4b6702e7dc7a"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    // Wait for data load
    await waitFor(() => {
      expect(screen.getAllByText('noticeService.js').length).toBeGreaterThanOrEqual(1);
    });

    // Header has start details
    expect(screen.getByText('backend/services/noticeService.js')).toBeInTheDocument();

    // Mandatory disclaimer is visible
    expect(
      screen.getByText(
        'This is a static estimate from code connections. It is not a guarantee, and no code was run.'
      )
    ).toBeInTheDocument();

    // Sentence summary with counts
    const sentenceBlock = screen.getByTestId('impact-sentences-block');
    expect(sentenceBlock).toHaveTextContent(/3 files/);
    expect(sentenceBlock).toHaveTextContent(/2 API endpoints/);
    expect(sentenceBlock).toHaveTextContent(/1 test/);

    // Count tiles have values
    const countTiles = screen.getByTestId('impact-count-tiles');
    expect(countTiles).toHaveTextContent('3'); // files
    expect(countTiles).toHaveTextContent('2'); // api endpoints
    expect(countTiles).toHaveTextContent('1'); // tests

    // Text list grouped by round shows all 6 items across 3 rounds
    expect(screen.getByText(/Round 1: depends directly on it/)).toBeInTheDocument();
    expect(screen.getByText(/Round 2: depends on round 1/)).toBeInTheDocument();
    expect(screen.getByText(/Round 3: depends on round 2/)).toBeInTheDocument();

    // Tests to review list shows candidate test
    const testsSection = screen.getByTestId('impact-tests-to-review');
    expect(testsSection).toHaveTextContent('notices.test.js');
    expect(testsSection).toHaveTextContent('Candidates found by static evidence. Nothing was run.');
  });

  it('2. helpers.js (circular) shows format.js and no start node in its own list', async () => {
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactHelpersCircularFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="00559e32-004a-4377-b610-3b90cebf27b1"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('helpers.js').length).toBeGreaterThanOrEqual(1);
    });

    // Check format.js is in the affected list
    expect(screen.getAllByText('format.js').length).toBeGreaterThanOrEqual(1);

    // Verify helpers.js is NOT in the affected items list
    const detailsList = screen.getByTestId('impact-grouped-details');
    expect(detailsList).not.toHaveTextContent('backend/utils/helpers.js');
  });

  it('3. legacyReport.js shows exactly "No other file depends on this item." and no diagram rings', async () => {
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactLegacyReportZeroFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="059b6e4e-4fe7-4d86-b458-fb793ecfc638"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('legacyReport.js')).toBeInTheDocument();
    });

    // Exactly "No other file depends on this item."
    expect(screen.getAllByText('No other file depends on this item.').length).toBeGreaterThanOrEqual(1);

    // No ripple diagram rings or container rendered
    expect(screen.queryByTestId('ripple-diagram-container')).not.toBeInTheDocument();
  });

  it('4. the API node shows its frontend caller', async () => {
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactApiNoticesFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="4631e8f9-c5cc-4923-8cc4-33b46d3f6457"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('GET /api/notices').length).toBeGreaterThanOrEqual(1);
    });

    // Caller is NoticePage.tsx
    expect(screen.getAllByText('NoticePage.tsx').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/via calls \(resolved\)/).length).toBeGreaterThanOrEqual(1);
  });

  it('5. the config node shows the reader file', async () => {
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactConfigJwtFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="f0916724-cb29-460f-ba83-ec45a1e38fbc"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('env:JWT_SECRET').length).toBeGreaterThanOrEqual(1);
    });

    // Reader file db.js in round 1
    expect(screen.getAllByText('db.js').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/via reads \(resolved\)/).length).toBeGreaterThanOrEqual(1);
  });

  it('6. a hand-made possible item shows the dashed style marker, "?" badge and the word "possible"', async () => {
    const fixtureWithPossible: ImpactResult = {
      start: {
        id: 'start-1',
        label: 'service.js',
        type: 'backend',
        path: 'src/service.js',
        module: 'core',
      },
      affected: [
        {
          id: 'aff-1',
          label: 'dynamicCaller.js',
          type: 'backend',
          path: 'src/dynamicCaller.js',
          module: 'core',
          distance: 1,
          certainty: 'possible',
          via: { relation: 'calls', status: 'unresolved' },
        },
      ],
      counts: { files: 1, api_endpoints: 0, config: 0, tests: 0, modules: 1 },
      by_module: [{ module: 'core', count: 1 }],
      tests_to_review: [],
      truncated: false,
      unresolved_nearby: 0,
      notes: [],
    };

    vi.spyOn(api, 'getImpact').mockResolvedValue(fixtureWithPossible);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="start-1"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('service.js').length).toBeGreaterThanOrEqual(1);
    });

    // Diagram shows "?" badge
    expect(screen.getByTestId('possible-badge-aff-1')).toBeInTheDocument();

    // Node shape in SVG has dashed stroke
    const svgNode = screen.getByTestId('impact-node-aff-1');
    const shape = svgNode.querySelector('rect, circle, polygon');
    expect(shape).toHaveAttribute('stroke-dasharray', '4 3');

    // Text list explicitly shows the word "possible"
    const textListItem = screen.getByTestId('text-list-item-aff-1');
    expect(textListItem).toHaveTextContent('possible');
  });

  it('7. unresolved_nearby warning and truncated notice are displayed', async () => {
    const fixtureWithWarnings: ImpactResult = {
      start: {
        id: 'start-1',
        label: 'api.js',
        type: 'backend',
        path: 'src/api.js',
        module: 'core',
      },
      affected: [
        {
          id: 'aff-1',
          label: 'consumer.js',
          type: 'backend',
          path: 'src/consumer.js',
          module: 'core',
          distance: 1,
          certainty: 'proven',
          via: { relation: 'imports', status: 'resolved' },
        },
      ],
      counts: { files: 1, api_endpoints: 0, config: 0, tests: 0, modules: 1 },
      by_module: [{ module: 'core', count: 1 }],
      tests_to_review: [],
      truncated: true,
      unresolved_nearby: 4,
      notes: [],
    };

    vi.spyOn(api, 'getImpact').mockResolvedValue(fixtureWithWarnings);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="start-1"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('api.js').length).toBeGreaterThanOrEqual(1);
    });

    // Unresolved nearby warning
    expect(
      screen.getByText(
        '4 dynamic or unresolved references touch this area, so the real impact may be larger.'
      )
    ).toBeInTheDocument();

    // Truncated notice
    expect(
      screen.getByText(/truncated because the impact traversal reached the maximum display limit/i)
    ).toBeInTheDocument();
  });

  it('8. disclaimer is always visible even across states', async () => {
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactNoticeServiceFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="c0ed84ae-302c-47e5-909d-4b6702e7dc7a"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('impact-disclaimer')).toBeInTheDocument();
    });
    expect(screen.getByTestId('impact-disclaimer')).toHaveTextContent(
      'This is a static estimate from code connections. It is not a guarantee, and no code was run.'
    );
  });

  it('9. module node button is disabled with visible explanation in NodeDetailsPanel', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsModuleFixture.data as any);

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="mod-1"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('show-impact-btn')).toBeInTheDocument();
    });

    const impactBtn = screen.getByTestId('show-impact-btn');
    expect(impactBtn).toBeDisabled();
    expect(
      screen.getByText(
        'Impact works for files, API endpoints and config items. Choose one inside the module.'
      )
    ).toBeInTheDocument();
  });

  it('10. file node button is enabled with helper text in NodeDetailsPanel and triggers callback', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsFeesFixture.data as any);
    const onShowImpactMock = vi.fn();

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="fees-1"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
          onShowImpact={onShowImpactMock}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('show-impact-btn')).toBeInTheDocument();
    });

    const impactBtn = screen.getByTestId('show-impact-btn');
    expect(impactBtn).not.toBeDisabled();
    expect(screen.getByText('What may be affected if this changes')).toBeInTheDocument();

    fireEvent.click(impactBtn);
    expect(onShowImpactMock).toHaveBeenCalledWith('9d12a355-b348-4e99-9b24-783b4b845e19');
  });

  it('11. 400, 404 and 409 friendly error messages and never zeros for failed requests', async () => {
    // 400 IMPACT_NODE_UNSUPPORTED
    vi.spyOn(api, 'getImpact').mockRejectedValue(
      new ApiClientError(
        'Impact works for files, API endpoints and config items. Choose one inside the module.',
        400
      )
    );

    const { unmount } = render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="mod-1"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('impact-error-banner')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Impact works for files, API endpoints and config items. Choose one inside the module.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId('impact-count-tiles')).not.toBeInTheDocument();
    unmount();

    // 404
    vi.spyOn(api, 'getImpact').mockRejectedValue(
      new ApiClientError('This item is not in the selected project', 404)
    );

    const { unmount: unmount404 } = render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="unknown-1"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText('This item is not in the selected project')
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('impact-count-tiles')).not.toBeInTheDocument();
    unmount404();

    // 409
    vi.spyOn(api, 'getImpact').mockRejectedValue(
      new ApiClientError('Scan the project first', 409)
    );

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-unscanned"
          nodeId="node-1"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Scan the project first')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('impact-count-tiles')).not.toBeInTheDocument();
  });

  it('12. Retry button re-fetches impact data upon error', async () => {
    const getImpactMock = vi
      .spyOn(api, 'getImpact')
      .mockRejectedValueOnce(new Error('Network disconnected'))
      .mockResolvedValueOnce(impactNoticeServiceFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="c0ed84ae-302c-47e5-909d-4b6702e7dc7a"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('impact-error-banner')).toBeInTheDocument();
    });
    expect(screen.getByText('Network disconnected')).toBeInTheDocument();

    const retryBtn = screen.getByTestId('impact-retry-btn');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getAllByText('noticeService.js').length).toBeGreaterThanOrEqual(1);
    });
    expect(getImpactMock).toHaveBeenCalledTimes(2);
  });

  it('13. Aborts previous request when item changes or panel closes', async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(api, 'getImpact').mockImplementation((_proj, _node, _opts, signal) => {
      if (signal) signals.push(signal);
      return new Promise(() => {}); // never resolves
    });

    const { rerender, unmount } = render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="item-a"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(signals.length).toBe(1);
    expect(signals[0].aborted).toBe(false);

    // Switch item
    act(() => {
      rerender(
        <MemoryRouter>
          <ImpactView
            projectId="proj-1"
            nodeId="item-b"
            onClose={vi.fn()}
            onNavigateFocus={vi.fn()}
          />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(signals[0].aborted).toBe(true);
    });

    // Unmount
    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it('14. Escape key closes impact view and calls onClose', async () => {
    const onCloseMock = vi.fn();
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactNoticeServiceFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="c0ed84ae-302c-47e5-909d-4b6702e7dc7a"
          onClose={onCloseMock}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('noticeService.js').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('15. Keyboard Enter on a drawn diagram item calls onNavigateFocus', async () => {
    const onNavigateMock = vi.fn();
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactNoticeServiceFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="c0ed84ae-302c-47e5-909d-4b6702e7dc7a"
          onClose={vi.fn()}
          onNavigateFocus={onNavigateMock}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('impact-node-e3f5b928-83ed-4502-b988-552f6c1c026d')).toBeInTheDocument();
    });

    const drawnNode = screen.getByTestId('impact-node-e3f5b928-83ed-4502-b988-552f6c1c026d');
    fireEvent.keyDown(drawnNode, { key: 'Enter' });

    expect(onNavigateMock).toHaveBeenCalledWith('e3f5b928-83ed-4502-b988-552f6c1c026d');
  });

  it('16. Play reveals rounds progressively every 800 ms with fake timers, stops at last round', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'getImpact').mockResolvedValue(impactNoticeServiceFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="c0ed84ae-302c-47e5-909d-4b6702e7dc7a"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await act(async () => {
      await Promise.resolve();
    });

    const playBtn = screen.getByTestId('round-play-btn');
    expect(playBtn).toBeInTheDocument();

    // Click Play to start from round 1
    act(() => {
      fireEvent.click(playBtn);
    });

    expect(screen.getByText('Showing Round 1 of 3')).toBeInTheDocument();

    // Advance 800 ms -> Round 2
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByText('Showing Round 2 of 3')).toBeInTheDocument();

    // Advance 800 ms -> Round 3 (last round)
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByText('Showing Round 3 of 3')).toBeInTheDocument();

    // Advance another 800 ms -> stops
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(playBtn).toHaveTextContent('Play');
  });

  it('17. Under prefers-reduced-motion all rounds are shown and playback buttons are hidden', async () => {
    // Mock matchMedia for prefers-reduced-motion: reduce
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      return {
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as any;
    });

    vi.spyOn(api, 'getImpact').mockResolvedValue(impactNoticeServiceFixture.data as ImpactResult);

    render(
      <MemoryRouter>
        <ImpactView
          projectId="proj-1"
          nodeId="c0ed84ae-302c-47e5-909d-4b6702e7dc7a"
          onClose={vi.fn()}
          onNavigateFocus={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('noticeService.js').length).toBeGreaterThanOrEqual(1);
    });

    // Playback buttons should NOT be rendered
    expect(screen.queryByTestId('round-controls')).not.toBeInTheDocument();

    // All rounds in RippleDiagram are rendered
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText('Round 3')).toBeInTheDocument();
  });
});
