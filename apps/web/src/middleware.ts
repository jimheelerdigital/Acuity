import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware(req) {
    const host = req.headers.get("host") ?? "";
    const { pathname } = req.nextUrl;

    // app.getacuity.io root → signin page (not the marketing landing page)
    if (host.startsWith("app.") && pathname === "/") {
      return NextResponse.redirect(new URL("/auth/signin", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Only require auth on the protected routes below.
      // For everything else (including the app.getacuity.io → signin redirect),
      // let the request through regardless of auth status.
      authorized: ({ token, req }) => {
        const protectedPaths = [
          "/home",
          "/dashboard",
          "/record",
          "/tasks",
          "/goals",
          "/insights",
          "/upgrade",
        ];
        const { pathname } = req.nextUrl;
        const isProtected = protectedPaths.some(
          (p) => pathname === p || pathname.startsWith(p + "/")
        );
        if (!isProtected) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    // Protected app routes
    "/home/:path*",
    "/dashboard/:path*",
    "/record/:path*",
    "/tasks/:path*",
    "/goals/:path*",
    "/insights/:path*",
    "/upgrade/:path*",
    // Root path — needed for app.getacuity.io redirect
    "/",
  ],
};
