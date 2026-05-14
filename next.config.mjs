/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Turbopack (Next.js 16 default): alias canvas to empty stub
  turbopack: {
    resolveAlias: {
      canvas: './src/lib/empty-canvas.js',
    },
  },
  // Webpack fallback
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
}

export default nextConfig
