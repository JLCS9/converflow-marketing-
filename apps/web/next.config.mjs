/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes still incompatible with Turbopack on Next 15 — re-enable once supported.
  output: 'standalone',
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
};

export default nextConfig;
