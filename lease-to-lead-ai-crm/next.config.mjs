/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false,
    serverComponentsExternalPackages: ["pdf-parse", "mammoth"]
  },
  async redirects() {
    return [{ source: "/hot-leads", destination: "/follow-up", permanent: true }];
  }
};

export default nextConfig;
