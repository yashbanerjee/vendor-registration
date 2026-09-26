import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["bcryptjs", "exceljs", "pdf-lib", "qrcode"],
}

export default nextConfig
