/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dce7fd",
          200: "#c0d3fc",
          300: "#94b4f8",
          400: "#628cf2",
          500: "#3f6aec",
          600: "#2a4de0",
          700: "#223cc6",
          800: "#2134a0",
          900: "#20317e",
        },
      },
    },
  },
  plugins: [],
};
