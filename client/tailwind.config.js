/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E', // Primary brand color
          800: '#115E59',
          900: '#134E4A',
          950: '#042F2E',
        },
        amber: {
          400: '#FBBF24',
          500: '#F59E0B', // Accent color
          600: '#D97706',
        },
        surface: {
          light: '#F3F7F7',
          dark: '#0B1313',
          cardDark: '#132220',
          borderDark: '#1F3835'
        }
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
