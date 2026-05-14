/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}

const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (cfg) => cfg

module.exports = withBundleAnalyzer(nextConfig)
