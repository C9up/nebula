/**
 * `floatingSurface` and `modalSurface` carry eight and four components
 * respectively, and their doc comments are mostly about how easy the teardown
 * order is to get wrong. These are the tests that say it is not.
 */

import { component, html, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import { layerCount } from "../../src/primitives/dismissable.js";
import { floatingSurface } from "../../src/primitives/floatingSurface.js";
import { modalSurface } from "../../src/primitives/modalSurface.js";
import { isScrollLocked } from "../../src/primitives/scrollLock.js";
import { mount, portalContent, portals, press } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

function pressEscape(): void {
	document.dispatchEvent(press("Escape"));
}

function clickOn(target: EventTarget): void {
	target.dispatchEvent(
		new MouseEvent("pointerdown", { bubbles: true, composed: true }),
	);
}

// ─── floatingSurface ─────────────────────────────────────────────────

/** The reason a surface reported, captured for assertions. */
type CloseSpy = (reason: string) => void;

interface FloatingHarness {
	open: ReturnType<typeof signal<boolean>>;
	onClose: CloseSpy;
	trapFocus?: boolean;
}

const FloatingHost = component<FloatingHarness>((props) => {
	floatingSurface({
		anchor: () => document.getElementById("anchor"),
		open: () => props.open(),
		onClose: (reason) => {
			props.onClose(reason);
			props.open(false);
		},
		trapFocus: props.trapFocus,
		content: () =>
			html`<div id="surface" role="dialog">
				<button id="inside">Inside</button>
			</div>`,
	});
	return html`<button id="anchor">Trigger</button>`;
});

describe("floatingSurface", () => {
	function harness(trapFocus?: boolean) {
		const open = signal(false);
		const onClose = vi.fn<CloseSpy>();
		const view = mount(FloatingHost({ open, onClose, trapFocus }));
		return { open, onClose, view };
	}

	it("mounts nothing while closed", () => {
		const { view } = harness();
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("portals the surface out of the component's own tree", () => {
		const { open, view } = harness();
		open(true);
		const surface = portalContent();
		expect(surface?.id).toBe("surface");
		// Out of the tree is the point — a popover left in place inherits every
		// overflow and transform between it and the root.
		expect(view.host.contains(surface)).toBe(false);
		view.dispose();
	});

	it("marks the surface open, then closed", () => {
		const { open, view } = harness();
		open(true);
		expect(portalContent()?.getAttribute("data-state")).toBe("open");
		open(false);
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("positions the surface, recording the side it landed on", () => {
		const { open, view } = harness();
		open(true);
		const surface = portalContent();
		expect(surface?.style.position).toBe("fixed");
		expect(surface?.getAttribute("data-side")).not.toBeNull();
		expect(
			surface?.style.getPropertyValue("--nebula-available-height"),
		).not.toBe("");
		view.dispose();
	});

	it("registers exactly one dismissable layer while open", () => {
		const before = layerCount();
		const { open, view } = harness();
		open(true);
		expect(layerCount()).toBe(before + 1);
		open(false);
		expect(layerCount()).toBe(before);
		view.dispose();
	});

	it("closes on Escape", () => {
		const { open, onClose, view } = harness();
		open(true);
		pressEscape();
		expect(onClose).toHaveBeenCalledWith("escape");
		expect(portals()).toHaveLength(0);
		view.dispose();
	});

	it("does not close when the anchor itself is pressed", () => {
		// Without the exclusion the trigger's pointerdown dismisses and its click
		// reopens — the classic "the button won't close it" bug.
		const { open, onClose, view } = harness();
		open(true);
		const anchor = document.getElementById("anchor");
		if (anchor !== null) clickOn(anchor);
		expect(onClose).not.toHaveBeenCalled();
		view.dispose();
	});

	it("closes on a press outside both surface and anchor", () => {
		const { open, onClose, view } = harness();
		open(true);
		clickOn(document.body);
		expect(onClose).toHaveBeenCalledWith("outside-pointer");
		view.dispose();
	});

	it("moves focus inside when it traps", () => {
		const { open, view } = harness(true);
		open(true);
		expect(document.activeElement?.id).toBe("inside");
		view.dispose();
	});

	it("hands focus back to the anchor when the surface held it", () => {
		// Dismissal by keyboard leaves focus in a subtree about to be removed.
		// `dismissable` handles Escape from a captured document listener and stops
		// propagation, so a component cannot do this in its own handler.
		const { open, view } = harness();
		open(true);
		document.getElementById("inside")?.focus();
		pressEscape();
		expect(document.activeElement?.id).toBe("anchor");
		view.dispose();
	});

	it("leaves focus where the user put it when a click dismissed the surface", () => {
		const elsewhere = document.createElement("button");
		elsewhere.id = "elsewhere";
		document.body.appendChild(elsewhere);

		const { open, view } = harness();
		open(true);
		elsewhere.focus();
		clickOn(elsewhere);
		expect(document.activeElement?.id).toBe("elsewhere");
		view.dispose();
	});

	it("takes everything down when the component unmounts mid-open", () => {
		// No exit animation to play for, so the node must go at once rather than
		// being orphaned in the body.
		const before = layerCount();
		const { open, view } = harness();
		open(true);
		view.dispose();
		expect(portals()).toHaveLength(0);
		expect(layerCount()).toBe(before);
	});
});

// ─── modalSurface ────────────────────────────────────────────────────

interface ModalHarness {
	open: ReturnType<typeof signal<boolean>>;
	onClose: CloseSpy;
	dismissOnOutside?: boolean;
}

const ModalHost = component<ModalHarness>((props) => {
	modalSurface({
		open: () => props.open(),
		onClose: (reason) => {
			props.onClose(reason);
			props.open(false);
		},
		panel: (root) => root.querySelector("#panel"),
		returnFocus: () => document.getElementById("trigger"),
		dismissOnOutside: props.dismissOnOutside,
		content: () =>
			html`<div id="overlay">
				<div id="backdrop"></div>
				<div id="panel" role="dialog"><button id="ok">OK</button></div>
			</div>`,
	});
	return html`<button id="trigger">Open</button>`;
});

describe("modalSurface", () => {
	function harness(dismissOnOutside?: boolean) {
		const sibling = document.createElement("div");
		sibling.id = "page";
		document.body.appendChild(sibling);

		const open = signal(false);
		const onClose = vi.fn<CloseSpy>();
		const view = mount(ModalHost({ open, onClose, dismissOnOutside }));
		return { open, onClose, view, sibling };
	}

	it("locks page scroll while open and releases it after", () => {
		const { open, view } = harness();
		open(true);
		expect(isScrollLocked()).toBe(true);
		open(false);
		expect(isScrollLocked()).toBe(false);
		view.dispose();
	});

	it("hides the rest of the page from assistive technology", () => {
		// The part hand-rolled modals always miss: trapping keyboard focus does
		// nothing for a reader navigating by landmark.
		const { open, view, sibling } = harness();
		open(true);
		expect(sibling.getAttribute("aria-hidden")).toBe("true");
		open(false);
		expect(sibling.hasAttribute("aria-hidden")).toBe(false);
		view.dispose();
	});

	it("restores an aria-hidden that was already there", () => {
		const { open, view, sibling } = harness();
		sibling.setAttribute("aria-hidden", "true");
		open(true);
		open(false);
		expect(sibling.getAttribute("aria-hidden")).toBe("true");
		view.dispose();
	});

	it("traps focus in the panel, not the overlay root", () => {
		const { open, view } = harness();
		open(true);
		expect(document.activeElement?.id).toBe("ok");
		view.dispose();
	});

	it("returns focus to the trigger on close", () => {
		const { open, view } = harness();
		document.getElementById("trigger")?.focus();
		open(true);
		open(false);
		expect(document.activeElement?.id).toBe("trigger");
		view.dispose();
	});

	it("closes on Escape", () => {
		const { open, onClose, view } = harness();
		open(true);
		pressEscape();
		expect(onClose).toHaveBeenCalledWith("escape");
		view.dispose();
	});

	it("closes on a press on the backdrop", () => {
		// Containment is answered against the panel. Checked against the overlay
		// root — which spans the viewport — every click would read as inside and
		// backdrop dismissal would silently never fire.
		const { open, onClose, view } = harness();
		open(true);
		const backdrop = document.getElementById("backdrop");
		if (backdrop !== null) clickOn(backdrop);
		expect(onClose).toHaveBeenCalledWith("outside-pointer");
		view.dispose();
	});

	it("stays open on a press inside the panel", () => {
		const { open, onClose, view } = harness();
		open(true);
		const ok = document.getElementById("ok");
		if (ok !== null) clickOn(ok);
		expect(onClose).not.toHaveBeenCalled();
		view.dispose();
	});

	it("refuses backdrop dismissal when told to", () => {
		const { open, onClose, view } = harness(false);
		open(true);
		const backdrop = document.getElementById("backdrop");
		if (backdrop !== null) clickOn(backdrop);
		expect(onClose).not.toHaveBeenCalled();
		// Escape still works — taking it away would trap a keyboard user.
		pressEscape();
		expect(onClose).toHaveBeenCalledWith("escape");
		view.dispose();
	});

	it("unlocks scroll and unhides the page when unmounted mid-open", () => {
		const { open, view, sibling } = harness();
		open(true);
		view.dispose();
		expect(isScrollLocked()).toBe(false);
		expect(sibling.hasAttribute("aria-hidden")).toBe(false);
		expect(portals()).toHaveLength(0);
	});
});
