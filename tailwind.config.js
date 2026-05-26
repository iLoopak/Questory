/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#02060d',
          900: '#07111f',
          800: '#0c1a2d',
          700: '#13263d',
          500: '#53677d',
        },
        ember: '#f59e0b',
        mint: '#22f3df',
        skyglass: '#8fb4ca',
      },
      boxShadow: {
        panel: '0 22px 70px rgba(0, 0, 0, 0.42), 0 0 32px rgba(34, 243, 223, 0.08)',
        glow: '0 0 28px rgba(34, 243, 223, 0.22)',
      },
    },
  },
  plugins: [],
};
