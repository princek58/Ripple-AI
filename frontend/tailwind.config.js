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
          text: 'var(--theme-text)',
          'text-muted': 'var(--theme-text-muted)',
          border: 'var(--theme-border)',
          accent: 'var(--theme-accent)',
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
