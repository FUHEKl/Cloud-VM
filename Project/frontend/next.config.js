/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Allow self-signed certificates in development / internal fetches
  // (Next.js server-side fetch to the gateway inside Docker).
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
