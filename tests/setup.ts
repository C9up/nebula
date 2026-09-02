/**
 * jsdom implements no layout, and so ships no `scrollIntoView`. The keyboard
 * navigation code calls it to keep the active item in view; there is nothing
 * to scroll in a headless DOM and nothing to assert about it, so a no-op is
 * the honest stand-in. It is the only browser API these tests fake, and only
 * because rendering is the one question jsdom deliberately declines to answer.
 */
Element.prototype.scrollIntoView = () => {};
