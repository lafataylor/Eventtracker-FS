/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  trailingSlash: true,
  async redirects() {
    return [
      {
        source: '/',
        destination: '/mexico-city',
        permanent: true,
      },
      {
        source: '/es',
        destination: '/es/mexico-city',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
