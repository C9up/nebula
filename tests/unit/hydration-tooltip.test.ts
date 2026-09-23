/**
 * The overlays, on the path a real page takes: SSR then hydrate.
 *
 * Every other suite here calls `render()` — the client-only path. An
 * application served by ream does neither: it ships markup the server built
 * and then adopts it, and an overlay whose whole behaviour is installed by
 * `floatingSurface` in `onMount` does nothing at all if that hook is not
 * reached on the adoption path. The symptom is a tooltip that never opens
 * while its trigger looks perfectly wired.
 */

import { html, hydrate, renderToString, resetIds } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge } from "../../src/atoms/Badge.js";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../src/organisms/Tooltip.js";

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = "";
});

const one = (selector: string): HTMLElement | null =>
	document.querySelector<HTMLElement>(selector);

function hover(element: HTMLElement | null, type: string): void {
	element?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
}

function tip(trigger: string, content: string) {
	return Tooltip({
		children: () =>
			html`${TooltipTrigger({ children: trigger })}${TooltipContent({
				children: content,
			})}`,
	});
}

/** Server-render a page component, then adopt it the way the browser does. */
function ssrThenHydrate(page: () => ReturnType<typeof html>): HTMLElement {
	const host = document.createElement("div");
	document.body.appendChild(host);
	// What `renderPage` does before it builds: one page, one id sequence.
	// Without it the server pass carries on from wherever the last one stopped
	// and the browser, starting at zero, looks up ids that are not there.
	resetIds();
	host.innerHTML = renderToString(page());
	hydrate(host, page);
	return host;
}

describe("nebula > hydration > tooltip", () => {
	it("opens after hydration, interpolated directly", () => {
		vi.useFakeTimers();
		ssrThenHydrate(() => html`<section>${tip("?", "Delete this")}</section>`);

		hover(one("[data-slot='tooltip-trigger']"), "focusin");
		vi.runOnlyPendingTimers();

		expect(one("[data-slot='tooltip-content']")?.getAttribute("role")).toBe(
			"tooltip",
		);
	});

	it("opens after hydration when it sits inside another component's children", () => {
		// Where a tooltip actually lives: in the content of a badge, a cell or
		// a card — never alone at the top of a page.
		vi.useFakeTimers();
		ssrThenHydrate(
			() =>
				html`<section>${Badge({
					children: () => tip("?", "Delete this"),
				})}</section>`,
		);

		hover(one("[data-slot='tooltip-trigger']"), "focusin");
		vi.runOnlyPendingTimers();

		expect(one("[data-slot='tooltip-content']")?.getAttribute("role")).toBe(
			"tooltip",
		);
	});
});
