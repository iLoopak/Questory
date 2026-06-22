/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'rgb(var(--ink-950-rgb) / <alpha-value>)',
          900: 'rgb(var(--ink-900-rgb) / <alpha-value>)',
          800: 'rgb(var(--ink-800-rgb) / <alpha-value>)',
          700: 'rgb(var(--ink-700-rgb) / <alpha-value>)',
          500: 'rgb(var(--ink-500-rgb) / <alpha-value>)',
        },
        ember: 'rgb(var(--warning-rgb) / <alpha-value>)',
        mint: 'rgb(var(--accent-rgb) / <alpha-value>)',
        skyglass: 'rgb(var(--skyglass-rgb) / <alpha-value>)',
        white: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
        black: 'rgb(var(--overlay-rgb) / <alpha-value>)',
        slate: {
          100: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          200: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          300: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          400: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
          500: 'rgb(var(--text-subtle-rgb) / <alpha-value>)',
          600: 'rgb(var(--text-subtle-rgb) / <alpha-value>)',
        },
        red: {
          100: 'rgb(var(--danger-text-rgb) / <alpha-value>)',
          200: 'rgb(var(--danger-text-rgb) / <alpha-value>)',
          300: 'rgb(var(--danger-rgb) / <alpha-value>)',
          400: 'rgb(var(--danger-rgb) / <alpha-value>)',
          500: 'rgb(var(--danger-rgb) / <alpha-value>)',
        },
        amber: {
          50: 'rgb(var(--warning-text-rgb) / <alpha-value>)',
          100: 'rgb(var(--warning-text-rgb) / <alpha-value>)',
          200: 'rgb(var(--warning-text-rgb) / <alpha-value>)',
          300: 'rgb(var(--warning-rgb) / <alpha-value>)',
          400: 'rgb(var(--warning-rgb) / <alpha-value>)',
          500: 'rgb(var(--warning-rgb) / <alpha-value>)',
        },
        emerald: {
          200: 'rgb(var(--success-text-rgb) / <alpha-value>)',
          400: 'rgb(var(--success-rgb) / <alpha-value>)',
          500: 'rgb(var(--success-rgb) / <alpha-value>)',
        },
        sky: {
          200: 'rgb(var(--info-text-rgb) / <alpha-value>)',
          300: 'rgb(var(--info-rgb) / <alpha-value>)',
        },
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        glow: 'var(--shadow-glow)',
      },
      fontSize: {
        '2xs': ['var(--font-2xs)', { lineHeight: '1.2' }],
      },
      letterSpacing: {
        label:  'var(--tracking-label)',
        caps:   'var(--tracking-caps)',
        spread: 'var(--tracking-spread)',
      },
      textColor: {
        primary:   'rgb(var(--text-primary-rgb)  / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
        muted:     'rgb(var(--text-subtle-rgb)   / <alpha-value>)',
        disabled:  'rgb(var(--text-subtle-rgb)   / <alpha-value>)',
        accent:    'rgb(var(--qs-accent-primary-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
