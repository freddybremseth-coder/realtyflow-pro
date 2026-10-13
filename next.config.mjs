import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  experimental: {
    serverSourceMaps: false,
    // Next 14 keeps output tracing overrides under experimental.
    outputFileTracingIncludes: {
      "/api/workspaces/*/social-studio": [
        "./node_modules/ffmpeg-static/**",
      ],
    },
    // withWorkflow installs a custom webpack hook. Force Next's build worker
    // back on so the large RealtyFlow graph is compiled in a lower-memory worker.
    webpackBuildWorker: true,
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  webpack(config, { dev }) {
    // Large RealtyFlow builds do not benefit enough from retaining webpack's
    // production cache to justify the extra peak memory on Vercel.
    if (!dev) config.cache = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/api/nexus/communications/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "Vercel-CDN-Cache-Control", value: "no-store" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
}

const wrappedNextConfig = withWorkflow(nextConfig, {
  // Workflow bundles default to source maps; omitting them lowers build peak
  // memory without changing runtime behavior.
  workflows: {
    sourcemap: false,
  },
});

// workflow/next currently injects a top-level `turbopack` key even when the
// application builds with Next.js 14.2.35. Next 14 rejects that key and logs
// "Invalid next.config.mjs options". Webpack is the production compiler here.
// Keep all other Workflow configuration intact; remove only the incompatible key.
const { turbopack: _next14UnsupportedTurbopack, ...compatibleNextConfig } = wrappedNextConfig;
export default compatibleNextConfig;
