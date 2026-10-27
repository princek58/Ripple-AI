import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../lib/theme.js';
import { ProjectProvider } from '../lib/projectContext.js';
import { ChatProvider } from '../features/chat/ChatProvider.js';
import { ChatCircle } from '../features/chat/ChatCircle.js';
import { ChatPanel } from '../features/chat/ChatPanel.js';
import { AppShell } from '../components/layout/AppShell.js';
import { LandingPage } from '../pages/LandingPage.js';
import type { Project } from '../../../shared/types.js';

// Load fixture data
import aiStatusFixture from './fixtures/api/ai_status.json';
import aiSettingsDefaultFixture from './fixtures/api/ai_settings_default.json';
import aiSettingsEnableFixture from './fixtures/api/ai_settings_put_enable.json';

const mockProjectScanned: Project = {
  id: 'proj-123',
  name: 'Demo ERP',
  created_at: '2026-10-20T00:00:00Z',
  size_bytes: 1024,
  file_count: 10,
  languages: ['JavaScript', 'TypeScript'],
  last_scan_at: '2026-10-21T00:00:00Z',
};

const mockProjectUnscanned: Project = {
  id: 'proj-unscanned',
  name: 'Unscanned Project',
  created_at: '2026-10-20T00:00:00Z',
  size_bytes: 1024,
  file_count: 5,
  languages: ['JavaScript'],
  last_scan_at: null,
};

describe('ChatCircle and ChatSettings (K2 Part 3 & ADDENDUM K2-icon)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupFetchMock(customResponses?: Record<string, any>) {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);

      if (customResponses) {
        for (const [pattern, resp] of Object.entries(customResponses)) {
          if (urlStr.includes(pattern)) {
            if (typeof resp === 'function') {
              return resp(urlStr, init);
            }
            return new Response(JSON.stringify(resp), {
              status: resp.error ? (resp.status || 400) : 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }

      if (urlStr.includes('/summary')) {
        return new Response(
          JSON.stringify({
            data: {
              lastScan: { finished_at: '2026-10-21T00:00:00Z', status: 'completed' },
              counts: { nodes: 10, edges: 15, unresolvedEdges: 0, files: 10 },
              kpi: {
                openFindings: 2,
                criticalPlusHigh: 1,
                fixesPendingApproval: 0,
                verifiedFixes: 0,
              },
              bySeverity: { critical: 1, high: 0, medium: 1, low: 0, unknown: 0 },
              byConfidence: { confirmed: 1, likely: 1, hypothesis: 0 },
              byVerification: { not_tested: 2, reproduced: 0, fix_proposed: 0, fix_verified: 0 },
              affectedModules: [],
              recentFindings: [],
            },
            error: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/graph')) {
        return new Response(JSON.stringify({ data: { nodes: [], edges: [], unmapped_edges: [] }, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/findings')) {
        return new Response(
          JSON.stringify({ data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }, error: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr.includes('/fixes')) {
        return new Response(JSON.stringify({ data: { fixes: [], summary: {} }, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/test-runs') || urlStr.includes('/tests')) {
        return new Response(JSON.stringify({ data: { test_runs: [], summary: {} }, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/reports')) {
        return new Response(JSON.stringify({ data: { reports: [], items: [], total: 0, page: 1, pageSize: 20 }, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/ai-settings')) {
        return new Response(JSON.stringify(aiSettingsDefaultFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/api/ai/status')) {
        return new Response(JSON.stringify(aiStatusFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/api/projects')) {
        return new Response(JSON.stringify({ data: [mockProjectScanned, mockProjectUnscanned], error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data: null, error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  it('1. renders the circle button on the landing page and all 7 app routes', async () => {
    setupFetchMock();

    const allRoutes = [
      '/',
      '/app/overview',
      '/app/projects',
      '/app/graph',
      '/app/investigations',
      '/app/fixes',
      '/app/tests',
      '/app/reports',
    ];

    for (const route of allRoutes) {
      const { unmount } = render(
        <ThemeProvider>
          <MemoryRouter initialEntries={[route]}>
            <ProjectProvider initialProjectId="proj-123">
              <ChatProvider>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/app" element={<AppShell />}>
                    <Route path="overview" element={<div>Overview</div>} />
                    <Route path="projects" element={<div>Projects</div>} />
                    <Route path="graph" element={<div>Graph</div>} />
                    <Route path="investigations" element={<div>Investigations</div>} />
                    <Route path="fixes" element={<div>Fixes</div>} />
                    <Route path="tests" element={<div>Tests</div>} />
                    <Route path="reports" element={<div>Reports</div>} />
                  </Route>
                </Routes>
              </ChatProvider>
            </ProjectProvider>
          </MemoryRouter>
        </ThemeProvider>
      );

      const circleBtn = await screen.findByRole('button', { name: /Open Ripple AI chat/i });
      expect(circleBtn).toBeInTheDocument();
      unmount();
    }
  });

  it('2. accessible name and focus ring behavior', async () => {
    setupFetchMock();
    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: 'Open Ripple AI chat' });
    expect(btn).toBeInTheDocument();
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(btn).toHaveClass('focus-visible:ring-2');
  });

  it('3. toggles accessible name and aria-expanded when clicked', async () => {
    setupFetchMock();
    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: 'Open Ripple AI chat' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls', 'ripple-chat-panel');

    // Click to open
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveAttribute('aria-label', 'Close Ripple AI chat');

    // Click to close
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-label', 'Open Ripple AI chat');
  });

  it('4. contains original SVG and visible pill text on desktop, no text label on phone', async () => {
    setupFetchMock();
    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: 'Open Ripple AI chat' });
    const svg = btn.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');

    // Pill label exists and has responsive classes hidden on mobile, inline on desktop
    const pill = screen.getByTestId('chat-circle-pill-label');
    expect(pill).toHaveTextContent('Ask Ripple AI');
    expect(pill).toHaveClass('hidden', 'md:inline');
  });

  it('5. gentle ripple animation is absent under prefers-reduced-motion', async () => {
    // Mock reduced motion matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    setupFetchMock();
    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    // Animation spans should not exist under reduced motion
    const ripple1 = document.querySelector('.animate-chat-ripple-1');
    const ripple2 = document.querySelector('.animate-chat-ripple-2');
    expect(ripple1).toBeNull();
    expect(ripple2).toBeNull();
  });

  it('6. the circle is raised when the Impact view is open', async () => {
    setupFetchMock();
    render(
      <MemoryRouter initialEntries={['/app/graph?impact=00000000-0000-0000-0000-000000000001']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    const btn = screen.getByRole('button', { name: 'Open Ripple AI chat' });
    expect(btn).toHaveAttribute('data-raised', 'true');
    expect(btn.parentElement).toHaveClass('bottom-24');
  });

  it('7. settings: consent text comes from GET, PUT sends correct body only after checkbox', async () => {
    let capturedPutBody: any = null;
    setupFetchMock({
      '/ai-settings': (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          capturedPutBody = JSON.parse(String(init.body));
          return new Response(JSON.stringify(aiSettingsEnableFixture), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(aiSettingsDefaultFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    // Open chat panel and go to settings
    fireEvent.click(screen.getByRole('button', { name: 'Open Ripple AI chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chat settings' }));

    expect(await screen.findByTestId('chat-settings-section')).toBeInTheDocument();

    const aiSwitch = screen.getByLabelText('Turn on AI for this project');
    expect(aiSwitch).not.toBeChecked();

    // Click switch to open consent flow
    fireEvent.click(aiSwitch);

    const consentContainer = await screen.findByTestId('consent-container');
    expect(consentContainer).toBeInTheDocument();
    // Consent text matches GET response
    expect(consentContainer).toHaveTextContent(aiSettingsDefaultFixture.data.consent_text);

    // Confirm button is disabled until checkbox is checked
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    expect(confirmBtn).toBeDisabled();

    // Check "I understand"
    const checkbox = screen.getByLabelText('I understand');
    fireEvent.click(checkbox);
    expect(confirmBtn).not.toBeDisabled();

    // Confirm PUT
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(capturedPutBody).not.toBeNull();
    });
    expect(capturedPutBody.ai_enabled).toBe(true);
    expect(capturedPutBody.consent_version).toBe('2026-10-v2');
  });

  it('8. settings: code switch is disabled until AI is on and carries warning', async () => {
    setupFetchMock({
      '/ai-settings': aiSettingsDefaultFixture, // ai_enabled: false
    });

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Ripple AI chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chat settings' }));

    await screen.findByTestId('chat-settings-section');

    const codeSwitch = screen.getByLabelText('Allow sending up to 7 code lines');
    expect(codeSwitch).toBeDisabled();
    expect(screen.getByText('Only for code you own or may share')).toBeInTheDocument();
  });

  it('9. settings: shows plain words on failed PUT', async () => {
    setupFetchMock({
      '/ai-settings': (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          return new Response(
            JSON.stringify({
              data: null,
              error: 'AI_CONSENT_REQUIRED [CONSENT_VERSION_MISMATCH]',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
        return new Response(JSON.stringify(aiSettingsDefaultFixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-123">
          <ChatProvider>
            <ChatCircle />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Ripple AI chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chat settings' }));

    await screen.findByTestId('chat-settings-section');
    fireEvent.click(screen.getByLabelText('Turn on AI for this project'));

    fireEvent.click(screen.getByLabelText('I understand'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText(/AI_CONSENT_REQUIRED|Failed to save consent/i)
    ).toBeInTheDocument();
  });

  it('10. settings: switches disabled with reason when project is unscanned or unselected', async () => {
    // 10a. Unscanned project
    setupFetchMock();
    const { unmount: u1 } = render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId="proj-unscanned">
          <ChatProvider>
            <ChatCircle />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Ripple AI chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chat settings' }));

    expect(
      await screen.findByText('Scan the project first to configure AI settings.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Turn on AI for this project')).toBeDisabled();
    u1();

    // 10b. No project selected
    setupFetchMock({
      '/api/projects': { data: [], error: null },
    });
    const { unmount: u2 } = render(
      <MemoryRouter initialEntries={['/app/overview']}>
        <ProjectProvider initialProjectId={null}>
          <ChatProvider>
            <ChatCircle />
            <ChatPanel />
          </ChatProvider>
        </ProjectProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Ripple AI chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Chat settings' }));

    expect(
      await screen.findByText('Select a project to configure AI settings.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Turn on AI for this project')).toBeDisabled();
    u2();
  });
});
