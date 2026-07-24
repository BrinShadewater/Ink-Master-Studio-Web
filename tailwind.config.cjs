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
          50: '#edfcfb',
          100: '#d4f5f2',
          200: '#aaebe7',
          300: '#72d9d5',
          400: '#39bebd',
          500: '#159f9f',
          600: '#0f8185',
          700: '#10686d',
          800: '#125459',
          900: '#12464a',
          950: '#082b30',
        },
      },
      backgroundImage: {
        radial: "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
