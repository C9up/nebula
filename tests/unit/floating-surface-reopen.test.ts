/**
 * A surface reopened while its exit animation is still playing is a fully open
 * surface again.
 *
 * `hide()` detaches the dismiss layer, the position updater and the focus trap
 * before the exit starts. Reopening against the same anchor reused the node and
 * only set `data-state="open"`, so the surface came back with none of them:
 * Escape and outside clicks no longer closed it, it stopped following its
 * anchor, and a trapping surface let Tab leave. Radix keeps DismissableLayer and
 * Popper mounted for as long as the content is open, whatever came before.
 */

import { component, html, render, signal } from "@c9up/aurora";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floatingSurface } from "../../src/primitives/floatingSurface.js";
import { computedStyle } from "./helpers.js";

let host: HTMLElement;
let anchor: HTMLElement;

beforeEach(() => {
	host = document.createElement("div");
	anchor = document.createElement("button");
	host.append(anchor);
	document.body.appendChild(host);
});
afterEach(() => {
	vi.restoreAllMocks();
	host.remove();
	for (const panel of document.querySelectorAll("[data-panel]"))
		panel.parentElement?.remove();
});

/** Hold the exit open, as a browser always does while it animates. */
function keepExitPending(): void {
	vi.spyOn(window, "getComputedStyle").mockReturnValue(
		computedStyle({
			animationName: "exit",
			animationDuration: "120ms",
			animationDelay: "0s",
			transitionDuration: "0s",
			transitionDelay: "0s",
		}),
	);
}

function wire(extra: { trapFocus?: boolean } = {}) {
	const open = signal(false);
	const closes: string[] = [];
	const lifecycle: string[] = [];
	const Owner = component(() => {
		floatingSurface({
			open,
			anchor: () => anchor,
			content: () =>
				html`<div data-panel tabindex="-1"><button data-first>a</button><button data-last>b</button></div>`,
			onClose: (reason) => {
				closes.push(reason);
				open(false);
			},
			onOpened: () => lifecycle.push("opened"),
			onClosed: () => lifecycle.push("closed"),
			...extra,
		});
		return html`<span></span>`;
	});
	render(Owner({}), host);
	return { open, closes, lifecycle };
}

const panel = (): HTMLElement | null =>
	document.querySelector<HTMLElement>("[data-panel]");

function pressEscape(): void {
	document.dispatchEvent(
		new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
	);
}

function pointerDownOutside(): void {
	document.body.dispatchEvent(
		new PointerEvent("pointerdown", { bubbles: true }),
	);
}

describe("nebula > floatingSurface reopened mid-exit", () => {
	it("answers Escape again", () => {
		keepExitPending();
		const { open, closes } = wire();
		open(true);
		pressEscape();
		expect(closes).toHaveLength(1);

		open(true);
		expect(panel()?.getAttribute("data-state")).toBe("open");
		pressEscape();

		expect(closes).toHaveLength(2);
		expect(open()).toBe(false);
	});

	it("answers an outside pointer again", () => {
		keepExitPending();
		const { open, closes } = wire();
		open(true);
		pressEscape();
		open(true);

		pointerDownOutside();

		expect(closes).toEqual(["escape", "outside-pointer"]);
	});

	it("follows its anchor again", () => {
		keepExitPending();
		const { open } = wire();
		open(true);
		open(false);
		const listen = vi.spyOn(window, "addEventListener");
		open(true);
		// The position updater re-subscribes to scroll/resize.
		expect(listen.mock.calls.map(([type]) => type)).toEqual(
			expect.arrayContaining(["scroll", "resize"]),
		);
	});

	it("traps focus again", () => {
		keepExitPending();
		const { open } = wire({ trapFocus: true });
		open(true);
		open(false);
		open(true);
		const last = panel()?.querySelector<HTMLElement>("[data-last]");
		last?.focus();
		document.activeElement?.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
		);
		// Tab from the last focusable wraps to the first, inside the surface.
		expect(
			panel()?.querySelector("[data-first]") === document.activeElement,
		).toBe(true);
	});

	it("tells the component it is open again, so it can rewire its items", () => {
		keepExitPending();
		const { open, lifecycle } = wire();
		open(true);
		open(false);
		open(true);
		open(false);
		expect(lifecycle).toEqual(["opened", "closed", "opened", "closed"]);
	});

	it("keeps a single panel", () => {
		keepExitPending();
		const { open } = wire();
		open(true);
		open(false);
		open(true);
		expect(document.querySelectorAll("[data-panel]")).toHaveLength(1);
	});
});
