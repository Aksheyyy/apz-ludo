/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        // Muted player colors — saturated enough to read, calm enough to stay elegant.
        player: {
          red: '#e11d48', // rose-600
          green: '#059669', // emerald-600
          yellow: '#d97706', // amber-600
          blue: '#0284c7', // sky-600
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
