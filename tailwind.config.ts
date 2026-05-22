import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shell: {
          bg: '#090b10',
          panel: '#121722',
          panelSoft: '#161d2b',
          border: '#263147',
          text: '#e5ecf7',
          muted: '#8f9db5',
          accent: '#77e2ae',
          accentSoft: '#1f3c33'
        }
      },
      boxShadow: {
        panel: '0 10px 30px rgba(0, 0, 0, 0.3)'
      }
    },
  },
  plugins: [],
} satisfies Config
