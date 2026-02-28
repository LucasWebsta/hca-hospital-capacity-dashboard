/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-navy': '#1a2847',
        'light-navy': '#2d3e5f',
        'accent-blue': '#2563eb',
        'risk-moderate': '#f59e0b',
        'risk-high': '#ef4444',
      }
    },
  },
  plugins: [],
}
