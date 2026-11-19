const variableColors = (name, shades) =>
  Object.fromEntries(
    shades.map((shade) => [
      shade,
      `rgb(var(--c-${name}-${shade}) / <alpha-value>)`,
    ]),
  );

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        "panel-soft": "rgb(var(--c-panel-soft) / <alpha-value>)",
        white: "rgb(var(--c-white) / <alpha-value>)",
        slate: variableColors("slate", [
          50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
        ]),
        sky: variableColors("sky", [100, 200, 300, 400, 500, 950]),
        emerald: variableColors("emerald", [200, 300, 400, 500]),
        amber: variableColors("amber", [100, 200, 300, 400]),
        rose: variableColors("rose", [100, 200, 300, 400, 500, 950]),
        cyan: variableColors("cyan", [200, 300, 400]),
        orange: variableColors("orange", [200, 300]),
      },
    },
  },
  plugins: [],
};
