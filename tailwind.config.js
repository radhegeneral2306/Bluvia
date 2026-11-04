/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#e6f6f9', 100: '#c7ebf1', 500: '#0097b2', 600: '#027680', 700: '#01616a', 900: '#003d59' },
      },
    },
  },
  plugins: [],
};
