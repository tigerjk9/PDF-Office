/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // OG/Twitter 이미지 라우트가 런타임에 읽는 Pretendard OTF 를 서버 번들에 포함
  // (node_modules 폰트는 정적 분석으로 추적되지 않으므로 명시적으로 트레이싱).
  outputFileTracingIncludes: {
    '/opengraph-image': [
      './node_modules/pretendard/dist/public/static/Pretendard-Bold.otf',
      './node_modules/pretendard/dist/public/static/Pretendard-SemiBold.otf',
    ],
    '/twitter-image': [
      './node_modules/pretendard/dist/public/static/Pretendard-Bold.otf',
      './node_modules/pretendard/dist/public/static/Pretendard-SemiBold.otf',
    ],
  },
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
