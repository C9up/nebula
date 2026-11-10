/**
 * Shared test scaffolding.
 *
 * Not a `.test.ts`, so vitest does not try to run it as a suite.
 */

import { render, type TemplateResult } from "@c9up/aurora";

export interface Mounted {
	/** The element the template was rendered into. */
	readonly host: HTMLElement;
	/** Unmount and remove the host. */
	dispose(): void;
}

/**
 * Render a template into a fresh host attached to the document.
 *
 * Attached, not detached: `onMount` hooks measure, focus and observe, and all
 * of that behaves differently on a node outside the document. A helper that
 * rendered into a floating fragment would pass tests the real app fails.
 */
export function mount(template: TemplateResult): Mounted {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const stop = render(template, host);
	return {
		host,
		dispose(): void {
			stop();
			host.remove();
		},
	};
}

/**
 * A computed style holding exactly these values, for a stubbed
 * `getComputedStyle`.
 *
 * A real `CSSStyleDeclaration` with the values defined on it, so it is the
 * type the stub must return. jsdom computes no animations, and some of these
 * properties it does not know at all, so setting them through the style
 * would not stick.
 */
export function computedStyle(
	values: Readonly<Record<string, string>>,
): CSSStyleDeclaration {
	const style = document.createElement("div").style;
	for (const [property, value] of Object.entries(values)) {
		Object.defineProperty(style, property, { value, configurable: true });
	}
	return style;
}

/** Every portal host currently in the document. */
export function portals(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-nebula-portal]")];
}

/** The surface inside the one open portal, or `null`. */
export function portalContent(): HTMLElement | null {
	const host = portals()[0];
	const child = host?.firstElementChild;
	return child instanceof HTMLElement ? child : null;
}

export function press(
	key: string,
	init: KeyboardEventInit = {},
): KeyboardEvent {
	return new KeyboardEvent("keydown", { key, bubbles: true, ...init });
}

/** Let queued microtasks and a frame of timers run. */
export function tick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
