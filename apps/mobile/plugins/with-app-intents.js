/**
 * Expo config plugin — compiles the App Intents keystone into the iOS app.
 *
 * ── Why a config plugin (and not a checked-in ios/ file) ─────────────
 * This is a managed Expo project: `ios/` is NOT committed. The native project
 * is generated at build time by prebuild (CNG), so anything native — including
 * a Swift App Intent — has to be re-applied on every generation. That is what
 * this plugin does. Delete it and the App Intent silently disappears from the
 * next build; there is no other place it lives.
 *
 * ── What it does ─────────────────────────────────────────────────────
 * Two ordered steps against the generated iOS project:
 *
 *   1. withDangerousMod (ios): copy RippleShortcuts.swift from this plugins/
 *      folder into ios/<projectName>/ so it sits alongside the app's own
 *      sources. (withDangerousMod because we're touching files on disk, not a
 *      structured config — that's expected here.)
 *
 *   2. withXcodeProject: add that copied file to the app target's compile
 *      sources via IOSConfig.XcodeUtils.addBuildSourceFileToGroup. That helper
 *      creates the PBXBuildFile + PBXFileReference and wires the file into the
 *      first target's Sources build phase — the same thing dragging the file
 *      into Xcode would do. An AppShortcutsProvider compiled into the MAIN app
 *      target is all iOS needs to register the Siri phrases; no separate
 *      extension, no new entitlement.
 *
 * ── Idempotency ──────────────────────────────────────────────────────
 * prebuild can run repeatedly (e.g. --clean vs incremental). Step 1's copy is
 * naturally idempotent. Step 2 guards on project.hasFile(...) so we never add a
 * duplicate build reference (which would break compilation with a "duplicate
 * symbol"-style project error). Safe to run on a clean or an existing ios/.
 *
 * ── Verify after prebuild ────────────────────────────────────────────
 *   - ios/<projectName>/RippleShortcuts.swift exists.
 *   - The .pbxproj lists RippleShortcuts.swift in the app target's
 *     PBXSourcesBuildPhase (grep the pbxproj for "RippleShortcuts.swift").
 *   - On device: Shortcuts app → search "Ripple" shows "Start a Debrief";
 *     Siri "Start a debrief in Ripple" opens the recorder and arms it.
 */

const {
  withDangerousMod,
  withXcodeProject,
  IOSConfig,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SWIFT_FILE = "RippleShortcuts.swift";

/** Step 1 — copy the Swift source into ios/<projectName>/. */
function withSwiftFileCopied(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const { platformProjectRoot, projectName } = cfg.modRequest;
      const src = path.join(__dirname, SWIFT_FILE);
      const destDir = path.join(platformProjectRoot, projectName);
      const dest = path.join(destDir, SWIFT_FILE);

      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);

      return cfg;
    },
  ]);
}

/** Step 2 — add the copied file to the app target's compile sources. */
function withSwiftFileCompiled(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const { projectName } = cfg.modRequest;
    const relativePath = `${projectName}/${SWIFT_FILE}`;

    // Idempotency guard: don't add a second build reference on re-runs.
    if (project.hasFile(relativePath)) {
      return cfg;
    }

    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: relativePath,
      groupName: projectName,
      project,
    });

    return cfg;
  });
}

const withAppIntents = (config) => {
  // Logged so the EAS prebuild output confirms the plugin ran.
  // eslint-disable-next-line no-console
  console.warn(
    "[with-app-intents] applying: compile RippleShortcuts.swift (StartDebriefIntent + AppShortcutsProvider) into the iOS app target"
  );
  config = withSwiftFileCopied(config);
  config = withSwiftFileCompiled(config);
  return config;
};

module.exports = withAppIntents;
