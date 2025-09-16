/** @type {import('tailwindcss').Config} */
const withOpacityValue = (variable) => ({ opacityValue }) => {
  if (opacityValue !== undefined) {
    return `rgba(var(${variable}), ${opacityValue})`;
  }
  return `rgb(var(${variable}))`;
};

module.exports = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
      },
      screens: {
        origin: "800px",
      },
      colors: {
        neon: withOpacityValue("--color-neon"),
        mint: withOpacityValue("--color-mint"),
        muted: withOpacityValue("--color-muted"),
        ink: withOpacityValue("--color-ink"),
      },
    },
  },
  plugins: [],
};
