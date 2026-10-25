/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // UI brand colours
        cream: 'var(--color-cream)',
        forest: 'var(--color-forest)',
        lime: 'var(--color-lime)',
        'slate-green': 'var(--color-slate-green)',
        'near-black-green': 'var(--color-near-black-green)',

        // Semantic theme variables
        theme: {
          bg: 'var(--theme-bg)',
          surface: 'var(--theme-surface)',
          'surface-active': 'var(--theme-surface-active)',
          text: 'var(--theme-text)',
          'text-muted': 'var(--theme-text-muted)',
          border: 'var(--theme-border)',
          accent: 'var(--theme-accent)',
          'nav-active-bg': 'var(--theme-nav-active-bg)',
          'nav-active-text': 'var(--theme-nav-active-text)',
        },

        // Graph node types
        node: {
          project: 'var(--node-project)',
          module: 'var(--node-module)',
          frontend: 'var(--node-frontend)',
          backend: 'var(--node-backend)',
          api: 'var(--node-api)',
          database: 'var(--node-database)',
          config: 'var(--node-config)',
          test: 'var(--node-test)',
        },

        // Severity colours
        severity: {
          critical: 'var(--severity-critical)',
          high: 'var(--severity-high)',
          medium: 'var(--severity-medium)',
          low: 'var(--severity-low)',
          unknown: 'var(--severity-unknown)',
        },

        // Diff Viewer colours
        diff: {
          'add-bg': 'var(--diff-add-bg)',
          'add-text': 'var(--diff-add-text)',
          'del-bg': 'var(--diff-del-bg)',
          'del-text': 'var(--diff-del-text)',
          'line-number': 'var(--diff-line-number)',
          'gutter-bg': 'var(--diff-gutter-bg)',
        },

        // Graph Edge colours
        edge: {
          'investigation-path': 'var(--edge-investigation-path)',
        },

        // Change Impact colours
        impact: {
          ring: 'var(--impact-ring)',
          proven: 'var(--impact-proven)',
          possible: 'var(--impact-possible)',
        },
        pill: {
          'most-affected-bg': 'var(--pill-most-affected-bg)',
          'most-affected-text': 'var(--pill-most-affected-text)',
        },
      },
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        code: ['var(--font-jetbrains-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
