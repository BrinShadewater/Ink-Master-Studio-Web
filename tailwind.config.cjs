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
      backgroundImage: {
        radial: "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
