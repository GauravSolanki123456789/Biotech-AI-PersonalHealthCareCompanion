/**
 * GitHub Pages: set STATIC_EXPORT=1 and NEXT_PUBLIC_BASE_PATH=/Your-Repo-Name when
 * running `npm run build` (see `.github/workflows/deploy-github-pages.yml`).
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const baseSlug = rawBase.replace(/^\/+|\/+$/g, "");
/** GitHub Pages project sites need one leading slash (e.g. /Repo-Name). */
const basePath = baseSlug.length > 0 ? `/${baseSlug}` : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(basePath.length > 0 ? { basePath, assetPrefix: basePath } : {}),
  ...(staticExport
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
        eslint: { ignoreDuringBuilds: true },
      }
    : {}),
};

export default nextConfig;
