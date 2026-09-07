/**
 * A surface shared by several anchors must show the anchor it was opened for.
 *
 * Content is built once per open. `show()` returned early whenever something
 * was already live, without ever asking whether the anchor had changed — so a
 * menu shared by the rows of a table showed the FIRST row's entries however
 * many rows were clicked. Its position, dismissal listeners and focus trap all
 * still belonged to the old anchor too.
 */

import { component, html, render, signal } from "@c9up/aurora";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floatingSurface } from "../../src/primitives/floatingSurface.js";

let host: HTMLElement;
let first: HTMLElement;
let second: HTMLElement;

beforeEach(() => {
	host = document.createElement("div");
	first = document.createElement("button");
	second = document.createElement("button");
	host.append(first, second);
	document.body.appendChild(host);
});
afterEach(() => {
	vi.restoreAllMocks();
	host.remove();
	// Portalled nodes live on <body>, not inside the host, so removing the
	// host leaves them behind and the next test counts them too.
	for (const panel of document.querySelectorAll("[data-panel]"))
		panel.parentElement?.remove();
});

/** Open a surface whose content names the anchor it was built for. */
function wire() {
	const open = signal(false);
	const target = signal<HTMLElement | null>(null);
	let built = 0;
	const Owner = component(() => {
		floatingSurface({
			open,
			anchor: () => target(),
			content: () => {
				built += 1;
				return html`<div data-panel="${target() === first ? "first" : "second"}">
					x
				</div>`;
			},
			onClose: () => open(false),
		});
		return html`<span></span>`;
	});
	render(Owner({}) as never, host);
	return { open, target, builds: () => built };
}

const panels = () => [...document.querySelectorAll("[data-panel]")];

/**
 * Hold the exit open.
 *
 * This is the condition the defect needs and the one a browser is always in:
 * closing runs an animation, so the surface is still live when the next one
 * opens. Without it jsdom tears the surface down synchronously, `live` is
 * already null on reopen, and the anchor is never compared at all — a test
 * written without this passes whatever the code does.
 */
function keepExitPending(): void {
	vi.spyOn(window, "getComputedStyle").mockReturnValue({
		animationName: "nebula-zoom-out",
		animationDuration: "120ms",
		animationDelay: "0s",
		transitionDuration: "0s",
		transitionDelay: "0s",
		getPropertyValue: () => "",
	} as unknown as CSSStyleDeclaration);
}

describe("nebula > floatingSurface across anchors", () => {
	it("shows the anchor it was opened for, not the previous one", () => {
		keepExitPending();
		const { open, target } = wire();

		target(first);
		open(true);
		expect(panels().map((p) => p.getAttribute("data-panel"))).toEqual([
			"first",
		]);

		target(second);
		open(false);
		open(true);

		// The whole defect: content is built once per open, so a surface reused
		// across anchors kept showing the first one's entries.
		expect(panels().map((p) => p.getAttribute("data-panel"))).toEqual([
			"second",
		]);
	});

	it("leaves exactly one panel in the document", () => {
		keepExitPending();
		const { open, target } = wire();

		target(first);
		open(true);
		target(second);
		open(false);
		open(true);

		// Two would mean the old surface was never removed — invisible over the
		// page, swallowing the clicks underneath.
		expect(panels()).toHaveLength(1);
	});

	it("removes the panel when it closes", () => {
		const { open, target } = wire();
		target(first);
		open(true);
		expect(panels()).toHaveLength(1);

		open(false);

		expect(panels()).toHaveLength(0);
	});
});
