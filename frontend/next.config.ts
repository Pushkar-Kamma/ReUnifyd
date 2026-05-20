import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },       // video thumbnails
      { protocol: "https", hostname: "yt3.ggpht.com" },     // channel avatars
      { protocol: "https", hostname: "yt3.googleusercontent.com" }, // channel avatars alt
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // Google profile pics
    ],
  },
};

// Sentry wraps the config; if no DSN is set at build time, the wrapper is a no-op.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  // Avoid uploading source maps from CI without SENTRY_AUTH_TOKEN set.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
