const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pin the file-tracing root to this directory so Next.js doesn't pick a
  // sibling lockfile (e.g. one in a parent worktree) and stuff extra files
  // into the standalone bundle. Next 15 warns when multiple lockfiles are
  // detected; setting this silences the warning AND makes the standalone
  // build reproducible regardless of where it runs.
  outputFileTracingRoot: path.join(__dirname),
}

const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (cfg) => cfg

module.exports = withBundleAnalyzer(nextConfig)
