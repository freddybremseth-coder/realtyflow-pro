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

export default withWorkflow(nextConfig, {
  // Workflow bundles default to source maps; omitting them lowers build peak
  // memory without changing runtime behavior.
  workflows: {
    sourcemap: false,
  },
});
