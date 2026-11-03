// The repo is the organisation's root Pages site (unified-inertial-encoder.github.io), served at the
// domain root, so no basePath. Set NEXT_BASE_PATH (e.g. "/repo-name") only for a project-page deploy.
const basePath = process.env.NEXT_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    // Raw <img>/<video> tags are not rewritten by Next; components prefix with this.
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
