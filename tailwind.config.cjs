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
          50: '#f2f7f2',
          100: '#e0ecdf',
          200: '#c2d7c0',
          300: '#9fbd9c',
          400: '#83a880',
          500: '#6f956e',
          600: '#547b56',
          700: '#426345',
          800: '#354f39',
          900: '#2b4030',
          950: '#17251c',
        },
      },
      backgroundImage: {
        radial: "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
