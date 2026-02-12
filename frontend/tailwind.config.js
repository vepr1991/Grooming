/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./admin.html",
    "./client.html",
    "./src/**/*.{js,ts}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "primary": "var(--c-primary)",
        "background-dark": "var(--c-bg)",
        "surface-dark": "var(--c-surface)",
        "border-dark": "var(--c-border)",
        "text-secondary": "var(--c-text-sec)",
        "success": "var(--c-success)",
        "error": "var(--c-error)",
        "white": "var(--c-text-main)"
      },
      fontFamily: {
        "display": ["Plus Jakarta Sans", "sans-serif"]
      },
    },
  },
  plugins: [],
}