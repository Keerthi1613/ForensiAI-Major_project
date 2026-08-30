/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["'Inter'", "sans-serif"],
      },
      colors: {
        background: "#0A0C0F",
        surface: "#0F1318",
        elevated: "#161B22",
        divider: "#1E2530",
        primary: "#00D4FF",
        warning: "#F59E0B",
        danger: "#EF4444",
        success: "#10B981",
        "text-primary": "#E8ECF0",
        "text-secondary": "#6B7A8D",
        "text-muted": "#3A4553",
      },
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "4px",
      },
      boxShadow: {
        tactical: "0 1px 3px rgba(0,0,0,0.4)",
      }
    }
  },
  plugins: []
};
