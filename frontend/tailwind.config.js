/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        btc: {
          orange: '#F7931A',
          'orange-dark': '#D4780E',
          'orange-light': '#FFB347',
        },
        neon: {
          green: '#00FF88',
          'green-dark': '#00CC6A',
          red: '#FF4D4D',
          'red-dark': '#CC0000',
          blue: '#00D4FF',
          purple: '#8B5CF6',
        },
        dark: {
          900: '#0A0A0F',
          800: '#111118',
          700: '#1A1A26',
          600: '#252535',
          500: '#2E2E42',
          400: '#3D3D55',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'count-down': 'count-down 1s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'flicker': 'flicker 0.15s infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px currentColor, 0 0 10px currentColor' },
          '100%': { boxShadow: '0 0 10px currentColor, 0 0 20px currentColor, 0 0 40px currentColor' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
      },
      backgroundImage: {
        'grid-pattern': `
          linear-gradient(rgba(247, 147, 26, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(247, 147, 26, 0.03) 1px, transparent 1px)
        `,
        'btc-gradient': 'linear-gradient(135deg, #F7931A 0%, #FFB347 100%)',
        'dark-gradient': 'linear-gradient(180deg, #0A0A0F 0%, #111118 100%)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
};
