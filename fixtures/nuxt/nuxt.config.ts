// Fixture for stack-web's Nuxt profile (ideal-agentic-env). Kept minimal: setup + verify --full must pass.
export default defineNuxtConfig({
  compatibilityDate: "2026-11-01",
  devtools: { enabled: false },
  runtimeConfig: { public: { appName: "Fixture" } },
  routeRules: {
    "/**": {
      headers: {
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    },
  },
});
