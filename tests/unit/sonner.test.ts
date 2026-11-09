/**
 * Sonner — shadcn's current toaster, without the library.
 *
 * What is under test is behaviour sonner defines and an app relies on: ids
 * that update instead of stacking, timers that run out and hold while the
 * stack is hovered, a promise that turns one toast into its outcome, and
 * the announcements a screen reader gets — politely, or at once for an error.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "../../src/organisms/Sonner.js";
import { type Mounted, mount } from "./helpers.js";

const all = (selector: string): HTMLElement[] => [
	...document.querySelectorAll<HTMLElement>(selector),
];
const one = (selector: string): HTMLElement | null =>
	document.querySelector<HTMLElement>(selector);
const toasts = (): HTMLElement[] => all("[data-sonner-toast]");

/** Microtasks first (announcements, measuring), then timers up to `ms`. */
async function advance(ms: number): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
}

let view: Mounted | undefined;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(async () => {
	toast.dismiss();
	await advance(500);
	view?.dispose();
	view = undefined;
	vi.useRealTimers();
	document.body.innerHTML = "";
});

describe("Sonner > the region", () => {
	it("mounts its live regions empty, before any toast exists", () => {
		view = mount(Toaster({}));
		const polite = one("[data-slot='sonner'] [aria-live='polite']");
		const assertive = one("[data-slot='sonner'] [aria-live='assertive']");
		expect(polite?.getAttribute("role")).toBe("status");
		expect(assertive?.getAttribute("role")).toBe("alert");
		expect(polite?.textContent?.trim()).toBe("");
		expect(assertive?.textContent?.trim()).toBe("");
	});

	it("names itself with its hotkey, as sonner does", () => {
		view = mount(Toaster({}));
		expect(one("[data-slot='sonner']")?.getAttribute("aria-label")).toBe(
			"Notifications alt+T",
		);
		view.dispose();
		view = mount(Toaster({ containerAriaLabel: "Notifications système" }));
		expect(one("[data-slot='sonner']")?.getAttribute("aria-label")).toBe(
			"Notifications système alt+T",
		);
	});

	it("is exempt from the aria-hidden sweep of a modal", () => {
		view = mount(Toaster({}));
		expect(one("[data-slot='sonner']")?.hasAttribute("data-nebula-live")).toBe(
			true,
		);
	});
});

describe("Sonner > toast()", () => {
	it("shows a toast with its title and description, newest in front", async () => {
		view = mount(Toaster({}));
		toast("First");
		toast("Second", { description: "Sunday, 9:00" });
		await advance(0);
		const [front, behind] = toasts();
		expect(front?.querySelector("[data-title]")?.textContent).toBe("Second");
		expect(front?.querySelector("[data-description]")?.textContent).toBe(
			"Sunday, 9:00",
		);
		expect(front?.dataset.front).toBe("true");
		expect(behind?.dataset.front).toBe("false");
		expect(behind?.querySelector("[data-title]")?.textContent).toBe("First");
	});

	it("updates a toast raised again under the same id, instead of stacking", async () => {
		view = mount(Toaster({}));
		toast("Offline", { id: "net" });
		toast.error("Still offline", { id: "net" });
		await advance(0);
		expect(toasts()).toHaveLength(1);
		expect(toasts()[0]?.dataset.type).toBe("error");
		expect(toasts()[0]?.textContent).toContain("Still offline");
	});

	it("gives each type shadcn's icon, and a plain toast none", async () => {
		view = mount(Toaster({}));
		toast("Plain");
		toast.success("Saved");
		await advance(0);
		const [success, plain] = toasts();
		expect(success?.querySelector("[data-icon] svg")).not.toBeNull();
		expect(plain?.querySelector("[data-icon]")).toBeNull();
	});

	it("lists what is on screen, without what is leaving", async () => {
		view = mount(Toaster({}));
		const id = toast("One");
		toast("Two");
		toast.dismiss(id);
		expect(toast.getToasts().map((entry) => entry.title)).toEqual(["Two"]);
	});
});

describe("Sonner > leaving", () => {
	it("closes itself after four seconds, and says so through onAutoClose", async () => {
		view = mount(Toaster({}));
		const onAutoClose = vi.fn();
		const onDismiss = vi.fn();
		toast("Saved", { onAutoClose, onDismiss });
		await advance(3900);
		expect(toasts()).toHaveLength(1);
		await advance(200);
		expect(toasts()[0]?.dataset.removed).toBe("true");
		await advance(300);
		expect(toasts()).toHaveLength(0);
		expect(onAutoClose).toHaveBeenCalledTimes(1);
		expect(onDismiss).not.toHaveBeenCalled();
	});

	it("takes the Toaster's duration, and Infinity stays", async () => {
		view = mount(Toaster({ duration: 1000 }));
		toast("Short");
		toast("Stays", { duration: Number.POSITIVE_INFINITY });
		await advance(1500);
		expect(toasts().map((node) => node.textContent)).toEqual(["Stays"]);
	});

	it("keeps a loading toast until it is replaced", async () => {
		view = mount(Toaster({}));
		const id = toast.loading("Uploading");
		await advance(10_000);
		expect(toasts()).toHaveLength(1);
		toast.success("Uploaded", { id });
		await advance(0);
		expect(toasts()[0]?.dataset.type).toBe("success");
		await advance(4500);
		expect(toasts()).toHaveLength(0);
	});

	it("holds every timer while the stack is hovered", async () => {
		view = mount(Toaster({}));
		toast("Read me");
		await advance(3000);
		const list = one("[data-sonner-toaster]");
		list?.dispatchEvent(new PointerEvent("pointerenter"));
		await advance(10_000);
		expect(toasts()).toHaveLength(1);
		list?.dispatchEvent(new PointerEvent("pointerleave"));
		// What was left — a second — still runs, not a fresh four.
		await advance(900);
		expect(toasts()[0]?.dataset.removed).toBe("false");
		await advance(500);
		expect(toasts()).toHaveLength(0);
	});

	it("dismisses one by id, or all at once, calling onDismiss", async () => {
		view = mount(Toaster({}));
		const onDismiss = vi.fn();
		const id = toast("One", { onDismiss, duration: Number.POSITIVE_INFINITY });
		toast("Two", { onDismiss, duration: Number.POSITIVE_INFINITY });
		toast("Three", { duration: Number.POSITIVE_INFINITY });
		toast.dismiss(id);
		await advance(300);
		expect(toasts()).toHaveLength(2);
		toast.dismiss();
		await advance(300);
		expect(toasts()).toHaveLength(0);
		expect(onDismiss).toHaveBeenCalledTimes(2);
	});
});

describe("Sonner > the stack", () => {
	it("shows three at most; the rest are kept but hidden", async () => {
		view = mount(Toaster({}));
		for (const title of ["1", "2", "3", "4"]) toast(title);
		await advance(0);
		expect(toasts().map((node) => node.dataset.visible)).toEqual([
			"true",
			"true",
			"true",
			"false",
		]);
		expect(toasts()[3]?.style.opacity).toBe("0");
	});

	it("piles up behind the front toast, and fans out while hovered", async () => {
		view = mount(Toaster({}));
		toast("Back");
		toast("Front");
		await advance(0);
		const behind = toasts()[1];
		expect(behind?.dataset.expanded).toBe("false");
		expect(behind?.style.transform).toContain("scale(0.95)");
		// Bottom corner: the pile rises above the front toast by one gap.
		expect(behind?.style.transform).toContain("translateY(-14px)");

		one("[data-sonner-toaster]")?.dispatchEvent(
			new PointerEvent("pointerenter"),
		);
		await advance(0);
		expect(behind?.dataset.expanded).toBe("true");
		expect(behind?.style.transform).not.toContain("scale");
	});

	it("fans out on Alt+T, the hotkey it names", async () => {
		view = mount(Toaster({}));
		toast("One");
		toast("Two");
		await advance(0);
		document.dispatchEvent(
			new KeyboardEvent("keydown", { altKey: true, code: "KeyT" }),
		);
		await advance(0);
		expect(toasts()[1]?.dataset.expanded).toBe("true");
	});

	it("gives a toast with its own position a list of its own", async () => {
		view = mount(Toaster({ position: "bottom-right" }));
		toast("Here");
		toast("There", { position: "top-center" });
		await advance(0);
		const lists = all("[data-sonner-toaster]");
		expect(lists.map((list) => list.dataset.yPosition)).toEqual([
			"bottom",
			"top",
		]);
		expect(lists[1]?.textContent).toContain("There");
	});

	it("shows only the toasts addressed to it by toasterId", async () => {
		view = mount(Toaster({ id: "side" }));
		toast("Everyone");
		toast("Side only", { toasterId: "side" });
		await advance(0);
		expect(toasts().map((node) => node.textContent)).toEqual(["Side only"]);
	});
});

describe("Sonner > buttons", () => {
	it("dismisses through the close button, whose label is the app's", async () => {
		view = mount(
			Toaster({
				closeButton: true,
				toastOptions: { closeButtonAriaLabel: "Fermer la notification" },
			}),
		);
		const onDismiss = vi.fn();
		toast("Saved", { onDismiss });
		await advance(0);
		const close = one("[data-close-button]");
		expect(close?.getAttribute("aria-label")).toBe("Fermer la notification");
		close?.click();
		await advance(300);
		expect(toasts()).toHaveLength(0);
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it("keeps a toast that is not dismissible", async () => {
		view = mount(Toaster({ closeButton: true }));
		toast("Pinned", { dismissible: false, duration: Number.POSITIVE_INFINITY });
		await advance(0);
		one("[data-close-button]")?.click();
		await advance(300);
		expect(toasts()).toHaveLength(1);
	});

	it("runs the action and closes, unless the handler prevented it", async () => {
		view = mount(Toaster({}));
		const retry = vi.fn();
		toast("Failed", { action: { label: "Retry", onClick: retry } });
		toast("Kept", {
			action: { label: "Undo", onClick: (event) => event.preventDefault() },
		});
		await advance(0);
		const [kept, failed] = toasts();
		failed?.querySelector<HTMLElement>("[data-action]")?.click();
		kept?.querySelector<HTMLElement>("[data-action]")?.click();
		await advance(300);
		expect(retry).toHaveBeenCalledTimes(1);
		expect(
			toasts().map((node) => node.querySelector("[data-title]")?.textContent),
		).toEqual(["Kept"]);
	});

	it("runs cancel and closes without onDismiss", async () => {
		view = mount(Toaster({}));
		const onCancel = vi.fn();
		const onDismiss = vi.fn();
		toast("Delete?", {
			cancel: { label: "Cancel", onClick: onCancel },
			onDismiss,
		});
		await advance(0);
		one("[data-cancel]")?.click();
		await advance(300);
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onDismiss).not.toHaveBeenCalled();
		expect(toasts()).toHaveLength(0);
	});
});

describe("Sonner > colours", () => {
	it("takes shadcn's popover surface, and sonner's rich colours on request", async () => {
		view = mount(Toaster({ richColors: true }));
		toast("Plain");
		toast.error("Broken");
		await advance(0);
		const [error, plain] = toasts();
		expect(plain?.className).toContain("bg-popover");
		expect(error?.dataset.richColors).toBe("true");
		expect(error?.className).toContain("bg-[hsl(359,100%,97%)]");
		expect(error?.className).not.toContain("bg-popover");
	});
});

describe("Sonner > toast.promise", () => {
	it("turns one loading toast into its success, and unwrap gives the value", async () => {
		view = mount(Toaster({}));
		const { id, unwrap } = toast.promise(Promise.resolve({ name: "Report" }), {
			loading: "Saving…",
			success: (saved) => `Saved ${saved.name}`,
			error: "Could not save",
		});
		expect(id).toBeDefined();
		await advance(0);
		expect(toasts()).toHaveLength(1);
		expect(toasts()[0]?.dataset.type).toBe("success");
		expect(toasts()[0]?.textContent).toContain("Saved Report");
		await expect(unwrap()).resolves.toEqual({ name: "Report" });
	});

	it("reports a rejection as an error, and unwrap hands it back", async () => {
		view = mount(Toaster({}));
		const failure = new Error("offline");
		const { unwrap } = toast.promise(Promise.reject(failure), {
			loading: "Saving…",
			error: (reason) => ({
				message: "Could not save",
				description: reason instanceof Error ? reason.message : "",
			}),
		});
		await advance(0);
		expect(toasts()[0]?.dataset.type).toBe("error");
		expect(toasts()[0]?.querySelector("[data-description]")?.textContent).toBe(
			"offline",
		);
		await expect(unwrap()).rejects.toBe(failure);
	});

	it("drops the loading toast when no stage says what happened", async () => {
		view = mount(Toaster({}));
		toast.promise(Promise.resolve(1), { loading: "Working" });
		await advance(300);
		expect(toasts()).toHaveLength(0);
	});
});

describe("Sonner > announcements", () => {
	it("reads an ordinary toast politely, and an error at once", async () => {
		view = mount(Toaster({}));
		toast.success("Saved", { description: "All changes kept" });
		toast.error("Could not save");
		await advance(0);
		const polite = one("[aria-live='polite']")?.textContent ?? "";
		const assertive = one("[aria-live='assertive']")?.textContent ?? "";
		expect(polite).toContain("Saved. All changes kept");
		expect(polite).not.toContain("Could not save");
		expect(assertive).toContain("Could not save");
	});

	it("announces an update, such as a promise reaching its outcome", async () => {
		view = mount(Toaster({}));
		const id = toast.loading("Saving…");
		await advance(0);
		toast.error("Could not save", { id });
		await advance(0);
		expect(one("[aria-live='assertive']")?.textContent).toContain(
			"Could not save",
		);
	});
});
