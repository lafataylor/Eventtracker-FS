/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  trailingSlash: true,
  async redirects() {
    // Dashless city URLs — same rule as FE/utils/locationSlug.ts.
    return [
      {
        source: '/',
        destination: '/mexicocity',
        permanent: true,
      },
      {
        source: '/es',
        destination: '/es/mexicocity',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
