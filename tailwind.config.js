/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eff8ff', 100: '#dbeefe', 500: '#1f8fe0', 600: '#0f74c4', 700: '#0c5ea1', 900: '#0a3a63' },
      },
    },
  },
  plugins: [],
};
