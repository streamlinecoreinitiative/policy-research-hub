/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
    serverActions: {
      allowedOrigins: ['localhost']
    },
    outputFileTracingIncludes: {
      '/api/**': ['./data/**/*'],
      '/library/**': ['./data/**/*'],
    },
  },
};

export default nextConfig;
