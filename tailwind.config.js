/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // All greys, brand and status colours are CSS variables, so every screen follows light/dark automatically.
        surface: v('surface'),
        slate: { 50: v('s-50'), 100: v('s-100'), 200: v('s-200'), 300: v('s-300'), 400: v('s-400'), 500: v('s-500'), 600: v('s-600'), 700: v('s-700'), 800: v('s-800'), 900: v('s-900') },
        brand: { 50: v('b-50'), 100: v('b-100'), 500: v('b-500'), 600: v('b-600'), 700: v('b-700'), 900: v('b-900') },
        red: { 50: v('r-50'), 100: v('r-100'), 200: v('r-200'), 500: v('r-500'), 600: v('r-600'), 700: v('r-700') },
        emerald: { 50: v('g-50'), 100: v('g-100'), 600: v('g-600'), 700: v('g-700') },
        amber: { 50: v('a-50'), 100: v('a-100'), 200: v('a-200'), 500: v('a-500'), 600: v('a-600'), 700: v('a-700'), 800: v('a-800'), 900: v('a-900') },
      },
      borderRadius: { xl: '12px', '2xl': '16px' },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        sheet: { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { rise: 'rise .28s cubic-bezier(.16,1,.3,1) both', sheet: 'sheet .26s cubic-bezier(.16,1,.3,1) both' },
    },
  },
  plugins: [],
};
