/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* Read for hours, so it stays quiet: near-neutral slate, GaadiPe's
           teal for the product, and three states that mean the same thing
           everywhere — good, watch, wrong. The teal is the one on the checkout
           page, so the panel and what a customer sees are the same product. */
        brand: { DEFAULT: '#0f766e', light: '#14918a', accent: '#0d9488', deep: '#0b4f4a' },
        ink: '#0b1f1c', body: '#41514e', muted: '#6b8380', line: '#e3ecea', shell: '#f3f8f7',
        good: { 50: '#e9f8ef', 500: '#12a150', 700: '#0a6c34' },
        watch: { 50: '#fff6e6', 500: '#e08700', 700: '#8f5600' },
        wrong: { 50: '#fdecec', 500: '#d92d20', 700: '#912018' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: { '2xs': ['11px', '14px'] },
      boxShadow: {
        card: '0 1px 2px rgba(11,31,28,.04), 0 1px 3px rgba(11,31,28,.03)',
        pop: '0 12px 32px rgba(11,31,28,.12)',
      },
    },
  },
  plugins: [],
};
