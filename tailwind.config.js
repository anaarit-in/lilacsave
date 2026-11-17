/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lilac: { 50: '#faf7ff', 100: '#f3ecff', 200: '#e7d7ff', 300: '#d2b4fe', 400: '#b986fb', 500: '#9c58f2', 600: '#8536db', 700: '#7028b7', 800: '#5e2595', 900: '#4d1f78' },
      },
      boxShadow: { soft: '0 18px 50px -24px rgba(72, 35, 118, .38)' },
    },
  },
  plugins: [],
}
