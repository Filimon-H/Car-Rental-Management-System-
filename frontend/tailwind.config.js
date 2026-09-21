/* eslint-env node */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand color
        primary: {
          DEFAULT: "#1a73e8",
          50: "#e8f0fe",
          100: "#d2e3fc",
          200: "#aecbfa",
          300: "#8ab4f8",
          400: "#669df6",
          500: "#4285f4",
          600: "#1a73e8",
          700: "#1967d2",
          800: "#185abc",
          900: "#174ea6",
        },
        // Brand palette (matches landing page)
        brand: {
          DEFAULT: "#601A25",
          light: "#7A2233",
          dark: "#4a1320",
        },
        orange: {
          brand: "#F15A24",
          light: "#FF6B3D",
          dark: "#d94e1e",
        },
        charcoal: "#333333",
        // Dark-theme surfaces and borders. These were pasted inline as arbitrary
        // values (bg-[#1a0810] and friends) across 50+ call sites, which meant
        // the dark palette could not be adjusted in one place. Named by role so
        // the intent survives: `surface` sits on `canvas`, `raised` on `surface`.
        night: {
          canvas: "#0d0407",   // page background
          surface: "#1a0810",  // cards, panels, table shells
          raised: "#22101a",   // inputs, controls sitting on a surface
          hover: "#2a1220",    // hover state for raised controls
          border: "#3d1520",   // hairlines and rings
          muted: "#9d7a80",    // de-emphasised text on dark
          subtle: "#f0b8a0",   // brand-tinted secondary text
        },
        // External brand colors, kept explicit so their source is obvious.
        telegram: {
          DEFAULT: "#229ED9",
          dark: "#1a8bc4",
        },
        // Sidebar dark color
        sidebar: {
          DEFAULT: "#1e293b",
          dark: "#0f172a",
          light: "#334155",
        },
        // Status colors
        success: {
          DEFAULT: "#22c55e",
          light: "#86efac",
          dark: "#16a34a",
        },
        warning: {
          DEFAULT: "#f59e0b",
          light: "#fcd34d",
          dark: "#d97706",
        },
        danger: {
          DEFAULT: "#ef4444",
          light: "#fca5a5",
          dark: "#dc2626",
        },
        // Background colors
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // Noto Sans Ethiopic follows Inter so Amharic falls through to a font
        // that can actually draw it; Latin text still renders in Inter.
        sans: ["Inter", "Noto Sans Ethiopic", "system-ui", "sans-serif"],
        display: ["Inter", "Noto Sans Ethiopic", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
