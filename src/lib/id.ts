/**
 * Stable element ids — aurora's counter, re-exported.
 *
 * It was nebula's own, and that was the bug: aurora resets its sequence at the
 * start of each render pass (`renderPage` server-side, `hydrate` in the
 * browser), and a second counter living here saw none of those resets. A
 * long-lived server therefore shipped `tooltip-trigger-14` while the browser,
 * hydrating from zero, minted `tooltip-trigger-1` and looked it up — so
 * `byId` answered `null`, `floatingSurface` had no anchor, and the tooltip
 * never opened although its mount hook had run and its trigger was wired.
 *
 * Every id nebula mints has to come from the same counter aurora resets; the
 * names are kept so nothing importing them has to change.
 */

export { byId, resetIds, uid } from "@c9up/aurora";
