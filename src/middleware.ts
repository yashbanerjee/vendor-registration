import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = Boolean(request.cookies.get("vms_session")?.value)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", pathname)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
  if (pathname.startsWith("/admin") || pathname.startsWith("/vendor")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow")
    if (!hasSession && !pathname.startsWith("/admin/login")) {
      const url = request.nextUrl.clone()
      url.pathname = pathname.startsWith("/vendor") ? "/login" : "/admin/login"
      url.searchParams.set("next", pathname)
      return NextResponse.redirect(url)
    }
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
