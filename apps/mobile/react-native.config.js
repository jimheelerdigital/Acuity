/**
 * React Native autolinking overrides.
 *
 * @react-native-google-signin/google-signin powers Android-only native Google
 * Sign-In (see lib/auth.ts — it's require()'d exclusively inside
 * `Platform.OS === "android"` blocks). iOS keeps the expo-auth-session Google
 * flow + Apple sign-in and must gain NO new native surface from this package.
 *
 * Setting platforms.ios = null disables iOS autolinking for this dependency, so
 * Expo prebuild does NOT add the GoogleSignin CocoaPod to the iOS Podfile.
 * Android autolinking (gradle) is untouched, so native sign-in still links there.
 */
module.exports = {
  dependencies: {
    "@react-native-google-signin/google-signin": {
      platforms: {
        ios: null,
      },
    },
  },
};
