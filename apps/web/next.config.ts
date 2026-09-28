import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@luma/ui', '@luma/translation', '@luma/audio'],
};

export default nextConfig;
