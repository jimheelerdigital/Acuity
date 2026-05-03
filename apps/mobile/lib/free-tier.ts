/**
 * Mobile-side helper to detect FREE post-trial users.
 *
 * Slice 7 dedup: the implementation now lives in @acuity/shared so
 * the partition rule is shared verbatim between web (server +
 * client) and mobile. This file remains a thin re-export so
 * callers don't need to update their import paths.
 */
export { isFreeTierUser } from "@acuity/shared";
