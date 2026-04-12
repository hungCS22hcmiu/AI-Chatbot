/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#7c3aed',
          accent: '#06b6d4',
          from: '#7c3aed',
          via: '#ec4899',
          to: '#f59e0b',
        },
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        muted: 'var(--text-muted)',
      },
      animation: {
        'blob-drift': 'blobDrift 12s ease-in-out infinite alternate',
        'spin-slow': 'spin 2s linear infinite',
        'fade-up': 'fadeUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        blobDrift: {
          '0%': { transform: 'translate(0,0) scale(1)' },
          '100%': { transform: 'translate(60px,-40px) scale(1.15)' },
        },
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
