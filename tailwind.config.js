/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#10B981', // Emerald 500
        secondary: '#3B82F6', // Blue 500
        dark: '#0F172A', // Slate 900
        card: '#1E293B', // Slate 800
      }
    },
  },
  plugins: [],
}
