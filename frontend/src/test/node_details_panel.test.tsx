import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NodeDetailsPanel } from '../features/graph/NodeDetailsPanel.js';
import { GraphPage } from '../features/graph/GraphPage.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { api } from '../lib/api.js';

// Real API Fixtures
import nodeDetailsFeesFixture from './fixtures/api/node_details_fees.json';
import nodeDetailsNoFindingsFixture from './fixtures/api/node_details_nofindings.json';
import nodeDetailsModuleFixture from './fixtures/api/node_details_module.json';
import graphClusteredL1Fixture from './fixtures/api/graph_clustered_l1.json';
import graphUnclusteredL1Fixture from './fixtures/api/graph_level1_unclustered.json';
import projectsListFixture from './fixtures/api/projects_list.json';

const capturedProjects = projectsListFixture.data;

describe('NodeDetailsPanel & Graph Expand / Show More (Step 11b Part B)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('panel shows incoming and outgoing edges and three separate badges per finding from fees.js capture', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsFeesFixture.data as any);

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="9d12a355-b348-4e99-9b24-783b4b845e19"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'fees.js' })).toBeInTheDocument();
    });

    // Check path in monospace block
    expect(screen.getByTestId('details-path')).toHaveTextContent('backend/routes/fees.js');

    // Check incoming and outgoing edges
    expect(screen.getByTestId('outgoing-edges-list')).toBeInTheDocument();

    // Check findings list and 3 separate badges
    const findingItem = screen.getByTestId('finding-item-4e2f4b5c-4ef3-4103-9279-9c97d20497e8');
    expect(findingItem).toBeInTheDocument();
    expect(findingItem).toHaveTextContent('Broken import "../services/feeService" in fees.js');

    // 1. SeverityBadge
    expect(within(findingItem).getByTestId('severity-badge-high')).toBeInTheDocument();
    expect(within(findingItem).getByTestId('severity-badge-high')).toHaveTextContent('High');

    // 2. ConfidenceBadge
    expect(within(findingItem).getByTestId('confidence-badge-confirmed')).toBeInTheDocument();
    expect(within(findingItem).getByTestId('confidence-badge-confirmed')).toHaveTextContent('Confirmed');

    // 3. VerificationBadge
    expect(within(findingItem).getByTestId('verification-badge-not_tested')).toBeInTheDocument();
    expect(within(findingItem).getByTestId('verification-badge-not_tested')).toHaveTextContent('Not tested');

    // Link to /app/investigations?finding=...
    const link = screen.getByRole('link', {
      name: /Broken import "\.\.\/services\/feeService" in fees\.js/,
    });
    expect(link).toHaveAttribute(
      'href',
      '/app/investigations?finding=4e2f4b5c-4ef3-4103-9279-9c97d20497e8'
    );
  });

  it('a node with no findings shows the no-findings text and static check note', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsNoFindingsFixture.data as any);

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="ee72eb89-e550-488b-becf-491de201c9ff"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'noticeService.js' })).toBeInTheDocument();
    });

    const banner = screen.getByTestId('no-findings-banner');
    expect(banner).toHaveTextContent('No findings for this node from the 6 automated checks');
    expect(banner).toHaveTextContent(
      'No findings does not mean no problems: Phase 1 runs only 6 static checks and executes no code.'
    );
  });

  it('sensitive file shows only name and path and redacts source details', async () => {
    const sensitiveNodeDetails = {
      node: {
        id: 'node-env-1',
        label: '.env',
        path: '.env',
        type: 'config',
        language: 'Environment',
        findingCount: 0,
        maxSeverity: null,
        meta_json: JSON.stringify({ sensitive: true }),
      },
      parentModule: null,
      incomingEdges: [],
      outgoingEdges: [],
      lineRange: null,
      relatedFindings: [],
    };

    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(sensitiveNodeDetails as any);

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="node-env-1"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '.env' })).toBeInTheDocument();
    });

    expect(screen.getByTestId('details-path')).toHaveTextContent('.env');
    expect(screen.getByTestId('sensitive-file-note')).toHaveTextContent(
      'Sensitive configuration file'
    );

    // Redacted: no line numbers, no incoming/outgoing lists, no findings list
    expect(screen.queryByTestId('incoming-edges-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outgoing-edges-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('findings-list')).not.toBeInTheDocument();
  });

  it('Escape closes panel and returns focus to the previously focused element', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsFeesFixture.data as any);
    const onCloseMock = vi.fn();

    // Create a mock trigger button to hold initial focus
    const triggerBtn = document.createElement('button');
    triggerBtn.setAttribute('data-testid', 'test-trigger-btn');
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="9d12a355-b348-4e99-9b24-783b4b845e19"
          onClose={onCloseMock}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'fees.js' })).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCloseMock).toHaveBeenCalledTimes(1);

    document.body.removeChild(triggerBtn);
  });

  it('no file content is displayed anywhere, only line numbers with Phase 1 note', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsFeesFixture.data as any);

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="9d12a355-b348-4e99-9b24-783b4b845e19"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'fees.js' })).toBeInTheDocument();
    });

    expect(screen.getByText(/Lines? 2/)).toBeInTheDocument();
    expect(screen.getByText('Source code is not displayed in Phase 1')).toBeInTheDocument();

    // Ensure raw code or imports code strings are not rendered
    expect(screen.queryByText(/const express = require/)).not.toBeInTheDocument();
  });

  it('expand on a module goes to level 2, on a file to level 3 with depth', async () => {
    const onExpandMock = vi.fn();

    // 1. Module node
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsModuleFixture.data as any);

    const { rerender } = render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="89fb17bf-cae8-4bac-8e77-845105972b4b"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={onExpandMock}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('expand-node-btn')).toHaveTextContent('Expand module');
    });

    fireEvent.click(screen.getByTestId('expand-node-btn'));
    expect(onExpandMock).toHaveBeenCalledWith('89fb17bf-cae8-4bac-8e77-845105972b4b', 'module', 1);

    // 2. File node (fees.js)
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsFeesFixture.data as any);
    rerender(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="9d12a355-b348-4e99-9b24-783b4b845e19"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={onExpandMock}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('expand-node-btn')).toHaveTextContent('Expand neighbourhood (depth 1)');
    });

    // Select depth 2
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByTestId('expand-node-btn')).toHaveTextContent('Expand neighbourhood (depth 2)');

    fireEvent.click(screen.getByTestId('expand-node-btn'));
    expect(onExpandMock).toHaveBeenCalledWith('9d12a355-b348-4e99-9b24-783b4b845e19', 'backend', 2);
  });

  it('Show more calls the API with larger maxNodes and disappears when clusters are gone', async () => {
    vi.spyOn(api, 'getProjects').mockResolvedValue(capturedProjects);

    // First call returns clustered graph
    const getGraphSpy = vi.spyOn(api, 'getGraph')
      .mockResolvedValueOnce(graphClusteredL1Fixture.data as any)
      .mockResolvedValueOnce(graphUnclusteredL1Fixture.data as any);

    render(
      <MemoryRouter initialEntries={['/app/graph?level=1']}>
        <ProjectProvider>
          <GraphPage />
        </ProjectProvider>
      </MemoryRouter>
    );

    // "Show more" button must appear because clusters exist
    const showMoreBtn = await screen.findByTestId('show-more-clusters-btn');
    expect(showMoreBtn).toBeInTheDocument();

    // Click "Show more"
    await act(async () => {
      fireEvent.click(showMoreBtn);
    });

    // Second call was triggered with larger maxNodes
    await waitFor(() => {
      expect(getGraphSpy).toHaveBeenCalledTimes(2);
      expect(getGraphSpy).toHaveBeenLastCalledWith(
        capturedProjects[0].id,
        expect.objectContaining({ maxNodes: 100 }),
        expect.any(AbortSignal)
      );
    });

    // In unclustered capture, clusters is empty, so "Show more" disappears
    await waitFor(() => {
      expect(screen.queryByTestId('show-more-clusters-btn')).not.toBeInTheDocument();
    });
  });

  it('ignores a late details response when user selects a different node', async () => {
    let resolveNodeA: (val: any) => void;
    const nodeAPromise = new Promise((res) => {
      resolveNodeA = res;
    });

    vi.spyOn(api, 'getNodeDetails').mockImplementation(async (_pid, nodeId) => {
      if (nodeId === 'node-A') {
        return nodeAPromise as any;
      }
      return nodeDetailsFeesFixture.data as any; // node-B (fees.js)
    });

    const { rerender } = render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="node-A"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    // While Node A is loading, switch to Node B
    rerender(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="9d12a355-b348-4e99-9b24-783b4b845e19"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    // Node B loads
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'fees.js' })).toBeInTheDocument();
    });

    // Now resolve late Node A response
    await act(async () => {
      resolveNodeA!({
        node: { id: 'node-A', label: 'LateNodeA', path: 'a.js', type: 'backend' },
        parentModule: null,
        incomingEdges: [],
        outgoingEdges: [],
        lineRange: null,
        relatedFindings: [],
      });
    });

    // Node B must remain shown, LateNodeA must be ignored
    expect(screen.getByRole('heading', { name: 'fees.js' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'LateNodeA' })).not.toBeInTheDocument();
  });

  it('navigating from an edge in the panel calls onNavigateNode with otherNode id', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsFeesFixture.data as any);
    const onNavigateMock = vi.fn();

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="9d12a355-b348-4e99-9b24-783b4b845e19"
          onClose={vi.fn()}
          onNavigateNode={onNavigateMock}
          onExpand={vi.fn()}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'fees.js' })).toBeInTheDocument();
    });

    // Click parent module link
    const parentModuleBtn = screen.getByTestId('parent-module-link');
    fireEvent.click(parentModuleBtn);
    expect(onNavigateMock).toHaveBeenCalledWith('89fb17bf-cae8-4bac-8e77-845105972b4b');
  });

  it('depth selector clamps to values between 1 and 3', async () => {
    vi.spyOn(api, 'getNodeDetails').mockResolvedValue(nodeDetailsFeesFixture.data as any);
    const onExpandMock = vi.fn();

    render(
      <MemoryRouter>
        <NodeDetailsPanel
          projectId="proj-1"
          nodeId="9d12a355-b348-4e99-9b24-783b4b845e19"
          onClose={vi.fn()}
          onNavigateNode={vi.fn()}
          onExpand={onExpandMock}
          onBackToLevel1={vi.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'fees.js' })).toBeInTheDocument();
    });

    // Check depth buttons 1, 2, 3 exist and clicking 3 updates expand label
    const depth3Btn = screen.getByRole('button', { name: '3' });
    fireEvent.click(depth3Btn);

    const expandBtn = screen.getByTestId('expand-node-btn');
    expect(expandBtn).toHaveTextContent('Expand neighbourhood (depth 3)');

    fireEvent.click(expandBtn);
    expect(onExpandMock).toHaveBeenCalledWith('9d12a355-b348-4e99-9b24-783b4b845e19', 'backend', 3);
  });
});
