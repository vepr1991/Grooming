/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#FF6B00', // Твой оранжевый брендбук
        surface: '#1E1E1E',
        background: '#121212',
      }
    },
  },
  plugins: [],
}