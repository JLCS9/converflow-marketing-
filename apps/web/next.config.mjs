/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes still incompatible with Turbopack on Next 15 — re-enable once supported.
  output: 'standalone',
  // Lint runs in `turbo lint` (CI). Don't double-block Docker builds on lint
  // — a missing rule plugin or unused-var warning shouldn't fail the deploy.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@converflow/shared'],
  async rewrites() {
    // /api/* rewrite is only for local dev so the browser hits the same origin
    // as the Next app (cookies travel). In prod the web calls api.converflow.ai
    // directly via NEXT_PUBLIC_API_URL — no rewrite needed.
    //
    // Guarding both with NODE_ENV and a defensive `||` (not `??`) so an empty
    // env var doesn't slip an "" destination into the rewrite, which makes
    // Next 15's page-data collection throw `TypeError: Invalid URL` and break
    // the whole production build.
    if (process.env.NODE_ENV === 'production') return [];
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim() || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
  async headers() {
    // The embeddable webchat widget MUST be loadable inside an iframe on the
    // tenant's own site. We explicitly clear frame-ancestors and X-Frame-Options
    // for /widget/* so the upstream Next/Nginx defaults don't block it.
    return [
      {
        source: '/widget/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *;" },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
    ];
  },
};

export default nextConfig;
