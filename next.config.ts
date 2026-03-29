import type { NextConfig } from "next";

const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const basePath = isGitHubActions && repositoryName ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  typedRoutes: true,
  images: {
    unoptimized: true
  },
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath
      }
    : {}),
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
