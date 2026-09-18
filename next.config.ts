import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_CASHFREE_ENV: process.env.CASHFREE_ENV || "sandbox",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://*.cashfree.com; object-src 'none'; base-uri 'self'; form-action 'self' https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com; frame-src 'self' https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com; connect-src 'self' https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com; upgrade-insecure-requests",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};
export default config;
