/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1f3d",
        muted: "#63708a",
        line: "#d9e2ef",
        panel: "#ffffff",
        app: "#f6f9fd"
      },
      boxShadow: {
        soft: "0 12px 34px rgba(20, 40, 80, 0.08)"
      }
    }
  },
  plugins: []
};
