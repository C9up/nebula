import { html } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { portal } from "../../src/primitives/portal.js";
import { onExitFinished, presence } from "../../src/primitives/presence.js";
import { isScrollLocked, lockScroll } from "../../src/primitives/scrollLock.js";
import { portals } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

describe("portal", () => {
	it("mounts content under its own host in the body", () => {
		const open = portal(html`<div id="surface">hello</div>`);
		expect(portals()).toHaveLength(1);
		expect(open.host.parentElement).toBe(document.body);
		expect(document.getElementById("surface")?.textContent).toBe("hello");
		open.close();
	});

	it("removes the host and its content on close", () => {
		const open = portal(html`<div id="surface"></div>`);
		open.close();
		expect(portals()).toHaveLength(0);
		expect(document.getElementById("surface")).toBeNull();
	});

	it("is safe to close twice", () => {
		const open = portal(html`<div></div>`);
		open.close();
		expect(() => open.close()).not.toThrow();
		expect(portals()).toHaveLength(0);
	});

	it("keeps sibling portals separate", () => {
		// One host each, so closing the first cannot take the second's nodes with
		// it — the failure mode of mounting straight into <body>.
		const first = portal(html`<div id="a"></div>`);
		const second = portal(html`<div id="b"></div>`);
		first.close();
		expect(document.getElementById("a")).toBeNull();
		expect(document.getElementById("b")).not.toBeNull();
		second.close();
	});
});

describe("scrollLock", () => {
	it("locks and restores the body's inline styles", () => {
		document.body.style.overflow = "scroll";
		const release = lockScroll();
		expect(document.body.style.overflow).toBe("hidden");
		release();
		expect(document.body.style.overflow).toBe("scroll");
	});

	it("leaves no inline padding behind where there was none", () => {
		// Restoring a *computed* value would write a hardcoded padding onto a body
		// that never had one, and the layout would stay shifted after closing.
		const release = lockScroll();
		release();
		expect(document.body.style.paddingRight).toBe("");
	});

	it("counts references so nested modals do not unlock early", () => {
		const outer = lockScroll();
		const inner = lockScroll();
		inner();
		expect(isScrollLocked()).toBe(true);
		expect(document.body.style.overflow).toBe("hidden");
		outer();
		expect(isScrollLocked()).toBe(false);
	});

	it("ignores a doubled release rather than unbalancing the count", () => {
		const outer = lockScroll();
		const inner = lockScroll();
		inner();
		inner();
		expect(isScrollLocked()).toBe(true);
		outer();
		expect(isScrollLocked()).toBe(false);
	});
});

describe("presence", () => {
	it("starts closed and unmounted by default", () => {
		const p = presence();
		expect(p.mounted()).toBe(false);
		expect(p.state()).toBe("closed");
	});

	it("mounts and flips state on open", () => {
		const p = presence();
		p.open();
		expect(p.mounted()).toBe(true);
		expect(p.state()).toBe("open");
	});

	it("unmounts immediately when nothing is animating", () => {
		// happy-dom reports no animation, which is the same answer a real browser
		// gives for an element with no exit rules — the node must not be stranded.
		const p = presence(true);
		const element = document.createElement("div");
		document.body.appendChild(element);
		p.attach(element);
		p.close();
		expect(p.state()).toBe("closed");
		expect(p.mounted()).toBe(false);
	});

	it("unmounts without an element rather than waiting for an event", () => {
		const p = presence(true);
		p.close();
		expect(p.mounted()).toBe(false);
	});

	it("ignores a close it is already closed for", () => {
		const p = presence(false);
		p.close();
		expect(p.mounted()).toBe(false);
	});
});

describe("onExitFinished", () => {
	it("runs at once when there is no animation", () => {
		const element = document.createElement("div");
		document.body.appendChild(element);
		let done = false;
		onExitFinished(element, () => {
			done = true;
		});
		expect(done).toBe(true);
	});

	it("returns a cancel that is safe to call", () => {
		const element = document.createElement("div");
		document.body.appendChild(element);
		const cancel = onExitFinished(element, () => {});
		expect(() => cancel()).not.toThrow();
	});
});
