/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08090c',
          900: '#101219',
          800: '#171b25',
          700: '#222838',
          500: '#586176',
        },
        ember: '#f97316',
        mint: '#2dd4bf',
        skyglass: '#93c5fd',
      },
      boxShadow: {
        panel: '0 24px 70px rgba(0, 0, 0, 0.32)',
      },
    },
  },
  plugins: [],
};
