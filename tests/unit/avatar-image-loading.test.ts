/**
 * AvatarImage follows its `src`, as Radix's `useImageLoadingStatus` does.
 *
 * The load is tried again whenever the source changes — a user replacing a
 * broken picture gets the new one — through a preload that carries the
 * referrer policy and CORS mode, and the `<img>` appears only once the
 * picture has loaded, so a broken image is never painted.
 */

import { html, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "../../src/atoms/Avatar.js";
import { mount } from "./helpers.js";

/** jsdom loads no image; this one is told what happened. */
class FakeImage extends EventTarget {
	static created: FakeImage[] = [];
	src = "";
	referrerPolicy = "";
	crossOrigin: string | null = null;
	complete = false;
	naturalWidth = 0;
	constructor() {
		super();
		FakeImage.created.push(this);
	}
	succeed(): void {
		this.complete = true;
		this.naturalWidth = 64;
		this.dispatchEvent(new Event("load"));
	}
	fail(): void {
		this.complete = true;
		this.dispatchEvent(new Event("error"));
	}
}

function latest(): FakeImage | undefined {
	return FakeImage.created.at(-1);
}

afterEach(() => {
	vi.unstubAllGlobals();
	FakeImage.created = [];
	document.body.innerHTML = "";
});

const img = (): HTMLImageElement | null =>
	document.querySelector<HTMLImageElement>("[data-slot='avatar-image']");
const fallback = (): Element | null =>
	document.querySelector("[data-slot='avatar-fallback']");

function avatar(src: () => string | undefined, extra = {}) {
	return mount(
		Avatar({
			children: () =>
				html`${AvatarImage({ src, alt: "Me", ...extra })}${AvatarFallback({
					children: "AB",
				})}`,
		}),
	);
}

describe("AvatarImage > loading", () => {
	it("shows a new src after an earlier one failed", () => {
		vi.stubGlobal("Image", FakeImage);
		const src = signal<string | undefined>("/broken.png");
		const view = avatar(src);
		latest()?.fail();
		expect(img()).toBeNull();
		expect(fallback()).not.toBeNull();

		src("/new-good.png");
		expect(latest()?.src).toBe("/new-good.png");
		latest()?.succeed();
		expect(img()?.getAttribute("src")).toBe("/new-good.png");
		expect(fallback()).toBeNull();
		view.dispose();
	});

	it("renders no <img> before the picture has loaded", () => {
		vi.stubGlobal("Image", FakeImage);
		const view = avatar(() => "/me.png");
		expect(img()).toBeNull();
		// The fallback still waits: initials then a photo is the flicker.
		expect(fallback()).toBeNull();
		latest()?.succeed();
		expect(img()).not.toBeNull();
		view.dispose();
	});

	it("shows the fallback when the src becomes empty", () => {
		vi.stubGlobal("Image", FakeImage);
		const src = signal<string | undefined>("/me.png");
		const view = avatar(src);
		latest()?.succeed();
		src("");
		expect(img()).toBeNull();
		expect(fallback()).not.toBeNull();
		view.dispose();
	});

	it("ignores the outcome of a src it has moved past", () => {
		vi.stubGlobal("Image", FakeImage);
		const src = signal<string | undefined>("/slow.png");
		const view = avatar(src);
		const slow = latest();
		src("/fast.png");
		latest()?.succeed();
		slow?.fail();
		expect(img()?.getAttribute("src")).toBe("/fast.png");
		view.dispose();
	});

	it("preloads and renders with the referrer policy and CORS mode it is given", () => {
		vi.stubGlobal("Image", FakeImage);
		const view = avatar(() => "https://other.example/me.png", {
			referrerPolicy: "no-referrer",
			crossOrigin: "anonymous",
		});
		expect(latest()?.referrerPolicy).toBe("no-referrer");
		expect(latest()?.crossOrigin).toBe("anonymous");
		latest()?.succeed();
		expect(img()?.getAttribute("referrerpolicy")).toBe("no-referrer");
		expect(img()?.getAttribute("crossorigin")).toBe("anonymous");
		view.dispose();
	});
});
