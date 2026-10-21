import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Room for a business logo upload (capped at 2MB in
      // app/actions/business-profile.ts) plus the rest of the form.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
