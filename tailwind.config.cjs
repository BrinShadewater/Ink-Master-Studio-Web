/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neutral: {
          50: '#fbfcfe',
          100: '#f2f4f7',
          200: '#e0e5ea',
          300: '#c6cdd7',
          400: '#a5aebb',
          500: '#7b8798',
          600: '#596477',
          700: '#3b4554',
          800: '#28303d',
          900: '#1d2430',
          950: '#151a22',
        },
        emerald: {
          50: '#fff1ed',
          100: '#ffe0d6',
          200: '#ffc1b0',
          300: '#ff9a82',
          400: '#ff8064',
          500: '#f56b4b',
          600: '#df5135',
          700: '#b93e29',
          800: '#8f3023',
          900: '#70291f',
          950: '#3f1712',
        },
      },
      backgroundImage: {
        radial: "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
