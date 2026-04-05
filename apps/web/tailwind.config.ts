import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        corpus: {
          bg: '#0D0D0D',
          text: '#EDEDEA',
          muted: '#888',
          line: '#1A1A1A',
          green: '#16A34A',
          amber: '#D97706',
          red: '#DC2626',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
