/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          obsidian: '#09090e',
          slate: '#131322',
          card: '#16162a',
          prosecutor: '#00f0ff', // Electric Neon Blue
          defender: '#a855f7',   // Royal Cyber Purple
          judge: '#10b981',      // Emerald Jade
          marshall: '#f59e0b',   // Amber Gold
        }
      },
      boxShadow: {
        'glow-prosecutor': '0 0 20px rgba(0, 240, 255, 0.35)',
        'glow-defender': '0 0 20px rgba(168, 85, 247, 0.35)',
        'glow-judge': '0 0 20px rgba(16, 185, 129, 0.35)',
        'glow-marshall': '0 0 20px rgba(245, 158, 11, 0.35)',
      }
    },
  },
  plugins: [],
}
