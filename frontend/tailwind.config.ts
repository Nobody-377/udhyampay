import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#090A0C',
        surface: {
          1: '#111317',
          2: '#181B21',
          3: '#22262F',
        },
        lime: {
          DEFAULT: '#C8FF32',
          hover: '#D7FF66',
          muted: 'rgba(200, 255, 50, 0.12)',
        },
        ink: {
          primary: '#F8FAFC',
          secondary: '#9CA3AF',
          muted: '#6B7280',
        },
        semantic: {
          success: '#34D399',
          warning: '#FBBF24',
          error: '#F87171',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderColor: {
        subtle: 'rgba(255, 255, 255, 0.08)',
        strong: 'rgba(255, 255, 255, 0.16)',
      },
      boxShadow: {
        card: '0 10px 30px -15px rgba(0, 0, 0, 0.65)',
        limeGlow: '0 0 0 1px rgba(200, 255, 50, 0.35), 0 8px 24px -8px rgba(200, 255, 50, 0.18)',
      },
    },
  },
  plugins: [],
};

export default config;

