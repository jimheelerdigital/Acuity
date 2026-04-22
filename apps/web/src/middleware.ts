export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    '/home/:path*',
    '/dashboard/:path*',
    '/record/:path*',
    '/tasks/:path*',
    '/goals/:path*',
    '/insights/:path*',
    '/upgrade/:path*',
  ],
}