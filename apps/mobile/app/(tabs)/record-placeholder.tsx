/**
 * Placeholder for the center "Record" tab slot. The real interaction
 * is the raised button in (tabs)/_layout.tsx which router.push's to
 * /record instead of navigating to this screen. Expo Router still
 * needs a backing file for every registered tab; this is it.
 *
 * Renders null because — if the override in _layout.tsx's tabBarButton
 * fails for any reason and this screen DOES get mounted — we want to
 * fail silently rather than flash a broken screen at the user.
 */
export default function RecordPlaceholder() {
  return null;
}
