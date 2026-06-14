// OAuth redirect sink for expo-auth-session's Google flow.
//
// expo-auth-session redirects to `<scheme>:/oauthredirect` after Google auth:
//   - Android: com.heelerdigital.acuity:/oauthredirect — the Custom Tab
//     redirect fires an intent that (since the intent filter added in
//     c3a0479) lands on MainActivity. Without a matching expo-router route,
//     expo-router renders its "Unmatched route" error screen instead of
//     letting useGoogleSignIn's promptAsync consume the redirect URL.
//   - iOS: the reverse-DNS redirect is captured INSIDE
//     ASWebAuthenticationSession and never routes through expo-router, so
//     this screen is never shown on iOS (inert, but harmless).
//
// Rendering null lets expo-router resolve `/oauthredirect` silently while the
// in-flight auth session resolves with the authorization code.
export default function OAuthRedirect() {
  return null;
}
