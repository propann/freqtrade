/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: require('path').join(__dirname, '../'),
  },
};

module.exports = nextConfig;
