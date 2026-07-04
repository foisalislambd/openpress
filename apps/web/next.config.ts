import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@openpress/shared', '@openpress/theme-default'],
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [
      { source: '/uploads/:path*', destination: `${api}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
