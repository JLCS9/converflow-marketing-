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
    // In dev, proxy /api/* to the NestJS API so cookies share the same origin.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
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
