import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { getContrastRatio, getBlendedContrastRatio } from '../lib/contrast.js';
import { TopPillNav } from '../components/layout/TopPillNav.js';
import { ThemeProvider, useTheme } from '../lib/theme.js';

function loadThemeTokens() {
  const cssPath = path.resolve(__dirname, '../styles/tokens.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const lightPart = css.split(':root')[1].split('}')[0];
  const darkPart = css.split('.dark')[1].split('}')[0];

  const parseTokens = (block: string) => {
    const tokens: Record<string, string> = {};
    const regex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(block)) !== null) {
      tokens[`--${match[1]}`] = match[2].trim();
    }
    return tokens;
  };

  const light = parseTokens(lightPart);
  const dark = parseTokens(darkPart);

  return {
    resolve: (theme: 'light' | 'dark', name: string): string => {
      if (theme === 'dark') {
        return dark[name] || light[name] || '';
      }
      return light[name] || '';
    },
    rawCss: css,
    darkBlock: darkPart,
    lightBlock: lightPart,
  };
}

describe('Contrast and Theme Integrity (Step 11c Part A)', () => {
  it('WCAG contrast ratio exceeds 4.5 for all text/background pairs in both themes', () => {
    const { resolve } = loadThemeTokens();
    const themes: Array<'light' | 'dark'> = ['light', 'dark'];

    for (const theme of themes) {
      // 1. Nav active
      const navActiveText = resolve(theme, '--theme-nav-active-text');
      const navActiveBg = resolve(theme, '--theme-nav-active-bg');
      expect(getContrastRatio(navActiveText, navActiveBg)).toBeGreaterThanOrEqual(4.5);

      // 2. Nav inactive (muted text on surface container)
      const navInactiveText = resolve(theme, '--theme-text-muted');
      const navSurface = resolve(theme, '--theme-surface');
      expect(getContrastRatio(navInactiveText, navSurface)).toBeGreaterThanOrEqual(4.5);

      // 3. Primary button
      const primaryText =
        theme === 'dark'
          ? resolve(theme, '--color-forest')
          : resolve(theme, '--color-cream');
      const primaryBg =
        theme === 'dark'
          ? resolve(theme, '--color-lime')
          : resolve(theme, '--color-forest');
      expect(getContrastRatio(primaryText, primaryBg)).toBeGreaterThanOrEqual(4.5);

      // 4. Secondary button (text on surface)
      const btnText = resolve(theme, '--theme-text');
      const btnSurface = resolve(theme, '--theme-surface');
      expect(getContrastRatio(btnText, btnSurface)).toBeGreaterThanOrEqual(4.5);

      // 5. Card text (primary text on surface)
      const cardText = resolve(theme, '--theme-text');
      const cardSurface = resolve(theme, '--theme-surface');
      expect(getContrastRatio(cardText, cardSurface)).toBeGreaterThanOrEqual(4.5);

      // 6. Muted text on card
      const mutedOnCard = resolve(theme, '--theme-text-muted');
      expect(getContrastRatio(mutedOnCard, cardSurface)).toBeGreaterThanOrEqual(4.5);

      // 7. Muted text on page background
      const pageBg = resolve(theme, '--theme-bg');
      expect(getContrastRatio(mutedOnCard, pageBg)).toBeGreaterThanOrEqual(4.5);

      // 8. SeverityBadge text on background for every enum value
      // Note: Severity badges use a 10% translucent tint over the card surface.
      // We test both the blended 10% background and the nearest solid equivalent (--theme-surface).
      const severities = ['critical', 'high', 'medium', 'low', 'unknown'];
      for (const sev of severities) {
        const sevColor = resolve(theme, `--severity-${sev}`);
        // Blended 10% tint on surface
        const blendedRatio = getBlendedContrastRatio(sevColor, cardSurface, 0.1);
        expect(blendedRatio).toBeGreaterThanOrEqual(4.5);

        // Nearest solid equivalent: card surface
        const solidRatio = getContrastRatio(sevColor, cardSurface);
        expect(solidRatio).toBeGreaterThanOrEqual(4.5);
      }

      // 9. ConfidenceBadge text on background for every enum value
      // confirmed: --theme-text on --theme-surface
      expect(getContrastRatio(resolve(theme, '--theme-text'), cardSurface)).toBeGreaterThanOrEqual(4.5);
      // likely: --theme-text-muted on --theme-surface
      expect(getContrastRatio(resolve(theme, '--theme-text-muted'), cardSurface)).toBeGreaterThanOrEqual(4.5);
      // hypothesis: --theme-text-muted on transparent over cardSurface
      expect(getContrastRatio(resolve(theme, '--theme-text-muted'), cardSurface)).toBeGreaterThanOrEqual(4.5);

      // 10. VerificationBadge text on background for every enum value
      // fix_verified: --theme-text on --theme-surface
      expect(getContrastRatio(resolve(theme, '--theme-text'), cardSurface)).toBeGreaterThanOrEqual(4.5);
      // fix_proposed: --theme-text on --theme-surface
      expect(getContrastRatio(resolve(theme, '--theme-text'), cardSurface)).toBeGreaterThanOrEqual(4.5);
      // reproduced: --severity-high on 10% tint over cardSurface
      const highSevColor = resolve(theme, '--severity-high');
      expect(getBlendedContrastRatio(highSevColor, cardSurface, 0.1)).toBeGreaterThanOrEqual(4.5);
      // not_tested: --theme-text-muted on --theme-surface
      expect(getContrastRatio(resolve(theme, '--theme-text-muted'), cardSurface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('TopPillNav marks active item with active semantic token classes, bold, indicator dot, and aria-current', () => {
    render(
      <MemoryRouter initialEntries={['/app/graph']}>
        <TopPillNav />
      </MemoryRouter>
    );

    const graphLink = screen.getByRole('link', { name: /graph/i });
    expect(graphLink).toBeInTheDocument();

    // Bold weight
    expect(graphLink.className).toContain('font-bold');

    // Semantic tokens (not color alone)
    expect(graphLink.className).toContain('bg-theme-nav-active-bg');
    expect(graphLink.className).toContain('text-theme-nav-active-text');

    // Accessible aria-current="page"
    expect(graphLink).toHaveAttribute('aria-current', 'page');

    // Active indicator dot element present with active token
    const dot = graphLink.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
    expect(dot?.className).toContain('bg-theme-nav-active-text');

    // Inactive link has text-theme-text-muted
    const overviewLink = screen.getByRole('link', { name: /overview/i });
    expect(overviewLink).toBeInTheDocument();
    expect(overviewLink.className).toContain('text-theme-text-muted');
    expect(overviewLink).not.toHaveAttribute('aria-current');
  });

  it('dark theme root sets color-scheme dark in CSS and on document root', () => {
    const { darkBlock, lightBlock } = loadThemeTokens();

    // Assert color-scheme declaration in tokens.css for both blocks
    expect(darkBlock).toContain('color-scheme: dark');
    expect(lightBlock).toContain('color-scheme: light');

    // Assert ThemeProvider updates document.documentElement.style.colorScheme
    const ThemeConsumer = () => {
      const { setTheme } = useTheme();
      return (
        <div>
          <button type="button" onClick={() => setTheme('dark')}>Set Dark</button>
          <button type="button" onClick={() => setTheme('light')}>Set Light</button>
        </div>
      );
    };

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    act(() => {
      screen.getByText('Set Dark').click();
    });

    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      screen.getByText('Set Light').click();
    });

    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
