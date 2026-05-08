/**
 * Expo config plugin — patches the generated Podfile's post_install
 * block to add `FOLLY_MOBILE=1` and `FOLLY_USE_LIBCPP=1` to every
 * pod target's GCC_PREPROCESSOR_DEFINITIONS.
 *
 * Why this exists (2026-05-08):
 *   react-native-iap@15.x ships an `ios.with-folly-no-coroutines`
 *   plugin option that injects a post_install block defining
 *   FOLLY_NO_CONFIG=1, FOLLY_CFG_NO_COROUTINES=1, FOLLY_HAS_COROUTINES=0
 *   on every target. That fixes the SDK-54 prebuilt-RN coroutine-
 *   header issue but leaves an asymmetric Folly config:
 *
 *     - FOLLY_NO_CONFIG=1     ← set by the iap plugin (skips folly-config.h)
 *     - FOLLY_MOBILE=1        ← MISSING (standard RN flag, normally
 *                                supplied by react_native_pods.rb's
 *                                folly_compiler_flags via OTHER_CFLAGS
 *                                on a subset of pods)
 *     - FOLLY_USE_LIBCPP=1    ← MISSING (same reason)
 *
 *   Pods that don't already have FOLLY_MOBILE=1 in their podspec's
 *   OTHER_CFLAGS now compile Folly headers with the
 *   FOLLY_NO_CONFIG-but-no-FOLLY_MOBILE combination, which trips
 *   F14IntrinsicsAvailability.h's `!FOLLY_MOBILE` branch and enables
 *   F14_VECTOR_INTRINSICS_AVAILABLE=1. Their object files reference
 *   `folly::f14::detail::F14LinkCheck<1>::check()` (1 = Simd). The
 *   ReactNativeDependencies-prebuilt Folly was compiled with
 *   FOLLY_MOBILE=1, so its F14Table.cpp only emitted
 *   `F14LinkCheck<0>::check()` (0 = None). Linker sees an undefined
 *   `F14LinkCheck<1>::check()` referenced from CSSAnimationsRegistry.o
 *   (RNReanimated) and fails:
 *
 *     Undefined symbols for architecture arm64
 *       folly::f14::detail::F14LinkCheck<(folly::f14::detail::F14IntrinsicsMode)1>::check()
 *       Referenced from: libRNReanimated.a CSSAnimationsRegistry.o
 *
 *   This plugin closes the gap by adding FOLLY_MOBILE=1 +
 *   FOLLY_USE_LIBCPP=1 to every target's GCC_PREPROCESSOR_DEFINITIONS,
 *   matching the standard RN folly_compiler_flags. Result: every pod
 *   compiles Folly headers with intrinsics OFF, matching the prebuilt
 *   library's F14LinkCheck<None> emission, link succeeds.
 *
 * Plugin order in app.json:
 *   This plugin MUST run after `react-native-iap` so the iap plugin's
 *   post_install block exists at our anchor point. Both blocks coexist
 *   inside `post_install do |installer|` and both iterate all targets;
 *   they do not conflict because they add different keys.
 *
 * Idempotency:
 *   The plugin checks whether `FOLLY_MOBILE=1` already appears in the
 *   Podfile contents before patching. Re-running prebuild on an
 *   already-patched Podfile is a no-op.
 */

const { withPodfile } = require("expo/config-plugins");

const ANCHOR = "post_install do |installer|";
const SENTINEL = "with-folly-mobile-flag (custom plugin):";
const PATCH = `

  # ${SENTINEL} Add FOLLY_MOBILE=1 + FOLLY_USE_LIBCPP=1 on every pod
  # target so RNReanimated and any other pods that don't pull the
  # standard folly_compiler_flags via OTHER_CFLAGS still compile
  # Folly headers with intrinsics OFF — matching the prebuilt
  # ReactNativeDependencies Folly. Without this the linker fails on
  # arm64 with undefined F14LinkCheck<1>::check (intrinsics-mode
  # mismatch). See apps/mobile/plugins/with-folly-mobile-flag.js for
  # the full diagnosis.
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      defs = (config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)'])
      defs << 'FOLLY_MOBILE=1' unless defs.any? { |d| d.to_s.include?('FOLLY_MOBILE') }
      defs << 'FOLLY_USE_LIBCPP=1' unless defs.any? { |d| d.to_s.include?('FOLLY_USE_LIBCPP') }
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
    end
  end`;

const withFollyMobileFlag = (config) => {
  return withPodfile(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(SENTINEL)) {
      // Already patched (idempotent).
      return cfg;
    }
    if (!contents.includes(ANCHOR)) {
      // No post_install block to attach to. Bail loudly so prebuild
      // surfaces the misconfiguration instead of silently shipping a
      // broken Podfile.
      throw new Error(
        "[with-folly-mobile-flag] Could not find `post_install do |installer|` in the generated Podfile. The Podfile shape may have changed; review apps/mobile/plugins/with-folly-mobile-flag.js."
      );
    }
    cfg.modResults.contents = contents.replace(ANCHOR, ANCHOR + PATCH);
    return cfg;
  });
};

module.exports = withFollyMobileFlag;
