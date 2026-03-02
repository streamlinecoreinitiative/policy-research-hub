/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
    serverActions: {
      allowedOrigins: ['localhost']
    }
  }
};

export default nextConfig;
