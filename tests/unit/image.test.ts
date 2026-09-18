/**
 * The responsive-image arithmetic, and the markup it produces.
 *
 * Worth testing at this level because none of it fails loudly. An image with a
 * wrong `sizes` still renders — it just quietly ships the 2560px variant to a
 * phone, which no smoke test notices and no user reports.
 */

import { signal } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import { Image } from "../../src/atoms/Image.js";
import {
	allSizes,
	DEFAULT_RESOLUTIONS,
	defaultImageResolver,
	densitySrcSet,
	fitClass,
	formatFromSource,
	type ImageUrlResolver,
	imageSizes,
	imageSrcSet,
	imageWidths,
	LIMITED_RESOLUTIONS,
	positionClass,
	setImageResolver,
} from "../../src/lib/image.js";
import { Picture } from "../../src/molecules/Picture.js";
import { mount } from "./helpers.js";

/** A resolver that makes every URL trivially readable in an assertion. */
const plain: ImageUrlResolver = (src, { width, format, quality }) =>
	`${src}|${width}${format ? `|${format}` : ""}${quality ? `|q${quality}` : ""}`;

afterEach(() => {
	setImageResolver(null);
});

describe("imageWidths", () => {
	it("offers the whole ladder for a full-width image", () => {
		expect(imageWidths({ layout: "full-width" })).toEqual([
			...DEFAULT_RESOLUTIONS,
		]);
	});

	it("uses the ladder it is given", () => {
		expect(
			imageWidths({ layout: "full-width", breakpoints: LIMITED_RESOLUTIONS }),
		).toEqual([...LIMITED_RESOLUTIONS]);
	});

	it("never offers a full-width variant larger than the source", () => {
		expect(imageWidths({ layout: "full-width", originalWidth: 1000 })).toEqual([
			640, 750, 828, 960,
		]);
	});

	it("covers 1x and 2x by rounding up, never by emitting the literal width", () => {
		// 700 and 1400 are on no ladder, and emitting them would be emitting
		// two widths the endpoint's allow-list does not contain. The rungs
		// just above are 750 and 1668 — covering the need, never short of it.
		const widths = imageWidths({ width: 700, layout: "constrained" });
		expect(widths).toContain(750);
		expect(widths).toContain(1668);
		expect(widths).not.toContain(700);
		expect(widths).not.toContain(1400);
	});

	it("draws from exactly the list @c9up/prism serves", () => {
		// Locked as a literal on BOTH sides rather than shared through a
		// dependency, because nebula must not depend on a native module and
		// prism must not depend on a component library. A width on one list
		// and not the other is a srcset entry that 400s — silent, because the
		// page still renders from its single src.
		expect(allSizes(DEFAULT_RESOLUTIONS)).toEqual([
			16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 960, 1080, 1280, 1668,
			1920, 2048, 2560, 3200, 3840, 4480, 5120, 6016,
		]);
	});

	it("draws every width from the list the endpoint serves", () => {
		// The contract between the two halves. A width outside it is a srcset
		// entry that 400s, and a page that silently falls back to one src.
		const offered = new Set(allSizes(DEFAULT_RESOLUTIONS));
		for (const layout of ["constrained", "fixed", "full-width"] as const) {
			for (const width of [48, 320, 400, 700, 1200, 1900, 5000]) {
				for (const w of imageWidths({ width, layout })) {
					expect(offered.has(w), `${layout} ${width} -> ${w}`).toBe(true);
				}
			}
		}
	});

	it("stops a constrained image at the rung covering twice its width", () => {
		const widths = imageWidths({ width: 400, layout: "constrained" });
		expect(Math.max(...widths)).toBe(828);
	});

	it("drops the variants a known source cannot fill", () => {
		expect(
			imageWidths({ width: 700, layout: "constrained", originalWidth: 1000 }),
		).toEqual([640, 750, 828, 960]);
	});

	it("still offers one width when the source is smaller than every rung", () => {
		// Returning nothing would leave the image with no srcset at all. One
		// entry is right: the endpoint clamps to the source rather than
		// enlarging it, so this URL serves the 500px the file actually has.
		expect(
			imageWidths({ width: 400, layout: "constrained", originalWidth: 500 }),
		).toEqual([640]);
	});

	it("returns each constrained width once, ascending", () => {
		// 640 is both a ladder rung and 2x of 320.
		const widths = imageWidths({ width: 320, layout: "constrained" });
		expect(widths).toEqual([...new Set(widths)].sort((a, b) => a - b));
		expect(widths.filter((w) => w === 640)).toHaveLength(1);
	});

	it("offers a fixed image at 1x and 2x only", () => {
		expect(imageWidths({ width: 48, layout: "fixed" })).toEqual([48, 96]);
	});

	it("does not offer a fixed image more widths than its source can fill", () => {
		expect(
			imageWidths({ width: 100, layout: "fixed", originalWidth: 150 }),
		).toEqual([128]);
		expect(imageWidths({ width: 100, layout: "fixed" })).toEqual([128, 256]);
	});

	it("generates nothing for layout none, or without a width", () => {
		expect(imageWidths({ width: 800, layout: "none" })).toEqual([]);
		expect(imageWidths({ layout: "constrained" })).toEqual([]);
		expect(imageWidths({ width: 0, layout: "fixed" })).toEqual([]);
	});
});

describe("imageSizes", () => {
	it("caps a constrained image at its declared width", () => {
		expect(imageSizes({ width: 800, layout: "constrained" })).toBe(
			"(min-width: 800px) 800px, 100vw",
		);
	});

	it("pins a fixed image", () => {
		expect(imageSizes({ width: 48, layout: "fixed" })).toBe("48px");
	});

	it("gives a full-width image the viewport, with or without a width", () => {
		expect(imageSizes({ width: 800, layout: "full-width" })).toBe("100vw");
		expect(imageSizes({ layout: "full-width" })).toBe("100vw");
	});

	it("says nothing for layout none", () => {
		expect(imageSizes({ width: 800, layout: "none" })).toBeUndefined();
	});
});

describe("srcset", () => {
	it("writes w descriptors through the resolver", () => {
		expect(
			imageSrcSet({
				src: "/a.jpg",
				widths: [400, 800],
				format: "webp",
				resolve: plain,
			}),
		).toBe("/a.jpg|400|webp 400w, /a.jpg|800|webp 800w");
	});

	it("is absent when there are no widths", () => {
		expect(imageSrcSet({ src: "/a.jpg", widths: [] })).toBeUndefined();
	});

	it("writes x descriptors for densities, on offered widths", () => {
		expect(
			densitySrcSet({
				src: "/a.jpg",
				width: 100,
				densities: [1, 2],
				resolve: plain,
			}),
		).toBe("/a.jpg|128 1x, /a.jpg|256 2x");
	});

	it("sorts densities and drops the ones past the source", () => {
		expect(
			densitySrcSet({
				src: "/a.jpg",
				width: 100,
				densities: [3, 1, 2],
				originalWidth: 250,
				resolve: plain,
			}),
		).toBe("/a.jpg|128 1x");
	});

	it("emits one entry per distinct offered width", () => {
		// Two densities that snap to the same rung are two identical URLs in a
		// srcset, and the browser downloads the same bytes twice.
		expect(
			densitySrcSet({
				src: "/a.jpg",
				width: 100,
				densities: [1, 1.2],
				resolve: plain,
			}),
		).toBe("/a.jpg|128 1x");
	});
});

describe("the default resolver", () => {
	it("points at the framework endpoint with short parameters", () => {
		expect(
			defaultImageResolver("/photos/a.jpg", {
				width: 640,
				format: "webp",
				quality: 70,
			}),
		).toBe("/__image?src=%2Fphotos%2Fa.jpg&w=640&f=webp&q=70");
	});

	it("omits what was not asked for", () => {
		expect(defaultImageResolver("/a.jpg", { width: 640 })).toBe(
			"/__image?src=%2Fa.jpg&w=640",
		);
	});

	it("rounds a fractional width, because a pixel count is an integer", () => {
		expect(defaultImageResolver("/a.jpg", { width: 640.6 })).toContain("w=641");
	});
});

describe("formatFromSource", () => {
	it("reads the extension", () => {
		expect(formatFromSource("/a/b/photo.PNG")).toBe("png");
		expect(formatFromSource("photo.jpg")).toBe("jpeg");
		expect(formatFromSource("photo.jpeg")).toBe("jpeg");
	});

	it("looks past a query string", () => {
		expect(formatFromSource("/photo.png?v=2")).toBe("png");
		expect(formatFromSource("/photo.png#top")).toBe("png");
	});

	it("says nothing for an unknown or missing extension", () => {
		expect(formatFromSource("/photo.tiff")).toBeUndefined();
		expect(formatFromSource("/photo")).toBeUndefined();
	});
});

describe("class mapping", () => {
	it("maps every fit and position to a Tailwind utility", () => {
		expect(fitClass("scale-down")).toBe("object-scale-down");
		expect(fitClass(undefined)).toBeUndefined();
		expect(positionClass("top left")).toBe("object-left-top");
		expect(positionClass(undefined)).toBeUndefined();
	});
});

describe("Image", () => {
	function img(template: ReturnType<typeof Image>): HTMLImageElement {
		const mounted = mount(template);
		const element = mounted.host.querySelector("img");
		if (element === null) throw new Error("no <img> rendered");
		return element;
	}

	it("reserves space and defers loading by default", () => {
		const element = img(
			Image({ src: "/a.jpg", alt: "A", width: 800, height: 600 }),
		);
		expect(element.getAttribute("width")).toBe("800");
		expect(element.getAttribute("height")).toBe("600");
		expect(element.getAttribute("loading")).toBe("lazy");
		expect(element.getAttribute("decoding")).toBe("async");
		expect(element.hasAttribute("fetchpriority")).toBe(false);
	});

	it("asks for webp unless told otherwise", () => {
		setImageResolver(plain);
		const element = img(Image({ src: "/a.jpg", alt: "A", width: 400 }));
		expect(element.getAttribute("src")).toBe("/a.jpg|640|webp");
		expect(element.getAttribute("srcset")).toContain("|webp 640w");
	});

	it("turns priority into all three loading hints at once", () => {
		const element = img(
			Image({ src: "/a.jpg", alt: "A", width: 800, priority: true }),
		);
		expect(element.getAttribute("loading")).toBe("eager");
		expect(element.getAttribute("decoding")).toBe("sync");
		expect(element.getAttribute("fetchpriority")).toBe("high");
	});

	it("lets an explicit attribute win over priority", () => {
		const element = img(
			Image({
				src: "/a.jpg",
				alt: "A",
				width: 800,
				priority: true,
				loading: "lazy",
			}),
		);
		expect(element.getAttribute("loading")).toBe("lazy");
		expect(element.getAttribute("decoding")).toBe("sync");
	});

	it("keeps an empty alt, because that is what marks it decorative", () => {
		const element = img(Image({ src: "/a.jpg", alt: "", width: 100 }));
		expect(element.hasAttribute("alt")).toBe(true);
		expect(element.getAttribute("alt")).toBe("");
	});

	it("carries the layout, fit and position classes", () => {
		const element = img(
			Image({
				src: "/a.jpg",
				alt: "A",
				layout: "full-width",
				fit: "cover",
				position: "top",
			}),
		);
		expect(element.className).toContain("w-full");
		expect(element.className).toContain("h-auto");
		expect(element.className).toContain("object-cover");
		expect(element.className).toContain("object-top");
	});

	it("omits srcset and sizes entirely for layout none", () => {
		const element = img(
			Image({ src: "/a.jpg", alt: "A", width: 800, layout: "none" }),
		);
		expect(element.hasAttribute("srcset")).toBe(false);
		expect(element.hasAttribute("sizes")).toBe(false);
	});

	it("drops sizes when the srcset carries densities", () => {
		const element = img(
			Image({ src: "/a.jpg", alt: "A", width: 100, densities: [1, 2] }),
		);
		expect(element.getAttribute("srcset")).toContain("2x");
		expect(element.hasAttribute("sizes")).toBe(false);
	});

	it("never mixes w and x descriptors", () => {
		// Explicit widths win; a srcset carrying both is invalid and browsers
		// respond by ignoring the attribute completely.
		const element = img(
			Image({
				src: "/a.jpg",
				alt: "A",
				width: 100,
				widths: [100, 200],
				densities: [1, 2],
			}),
		);
		const srcset = element.getAttribute("srcset") ?? "";
		expect(srcset).toContain("w");
		expect(srcset).not.toContain("x,");
		expect(srcset.endsWith("x")).toBe(false);
	});

	it("follows a resolver installed after the component was imported", () => {
		setImageResolver(() => "https://cdn.example/abc");
		const element = img(Image({ src: "/a.jpg", alt: "A", width: 400 }));
		expect(element.getAttribute("src")).toBe("https://cdn.example/abc");
	});

	it("re-points src and srcset when a reactive source changes", () => {
		// Every attribute is bound through an accessor rather than read once at
		// construction. Aurora never re-renders a component, so a binding that
		// reads its prop eagerly is frozen for the life of the node — and the
		// symptom is a gallery that keeps showing the first photo.
		setImageResolver(plain);
		const src = signal("/a.jpg");
		const mounted = mount(Image({ src, alt: "A", width: 400 }));
		const element = mounted.host.querySelector("img");
		expect(element?.getAttribute("src")).toBe("/a.jpg|640|webp");

		src("/b.jpg");
		expect(element?.getAttribute("src")).toBe("/b.jpg|640|webp");
		expect(element?.getAttribute("srcset")).toContain("/b.jpg|640|webp 640w");
	});

	it("re-computes the ladder when a reactive width changes", () => {
		setImageResolver(plain);
		const width = signal(48);
		const mounted = mount(
			Image({ src: "/a.jpg", alt: "A", width, layout: "fixed" }),
		);
		const element = mounted.host.querySelector("img");
		expect(element?.getAttribute("sizes")).toBe("48px");

		width(64);
		expect(element?.getAttribute("sizes")).toBe("64px");
		expect(element?.getAttribute("srcset")).toBe(
			"/a.jpg|64|webp 64w, /a.jpg|128|webp 128w",
		);
	});
});

describe("Picture", () => {
	function picture(props: Parameters<typeof Picture>[0]): HTMLElement {
		const mounted = mount(Picture(props));
		const element = mounted.host.querySelector("picture");
		if (element === null) throw new Error("no <picture> rendered");
		return element;
	}

	it("offers avif before webp, then the original as the img", () => {
		const element = picture({
			src: "/a.jpg",
			alt: "A",
			width: 800,
			height: 600,
		});
		const types = [...element.querySelectorAll("source")].map((source) =>
			source.getAttribute("type"),
		);
		expect(types).toEqual(["image/avif", "image/webp"]);
		expect(element.querySelector("img")).not.toBeNull();
	});

	it("keeps a PNG fallback a PNG, so transparency survives", () => {
		setImageResolver(plain);
		const element = picture({ src: "/logo.png", alt: "A", width: 200 });
		expect(element.querySelector("img")?.getAttribute("src")).toBe(
			"/logo.png|256|png",
		);
	});

	it("falls back to jpeg when the source is already a modern format", () => {
		setImageResolver(plain);
		const element = picture({ src: "/a.webp", alt: "A", width: 200 });
		expect(element.querySelector("img")?.getAttribute("src")).toBe(
			"/a.webp|256|jpeg",
		);
	});

	it("gives every source the same sizes as the img", () => {
		const element = picture({ src: "/a.jpg", alt: "A", width: 800 });
		const sizes = element.querySelector("img")?.getAttribute("sizes");
		for (const source of element.querySelectorAll("source")) {
			expect(source.getAttribute("sizes")).toBe(sizes);
		}
	});

	it("emits no source at all when there is no ladder to point at", () => {
		// An empty srcset is worse than a missing source: the browser picks
		// that source and renders nothing.
		const element = picture({
			src: "/a.jpg",
			alt: "A",
			width: 800,
			layout: "none",
		});
		expect(element.querySelectorAll("source")).toHaveLength(0);
		expect(element.querySelector("img")).not.toBeNull();
	});

	it("honours an explicit format list and its order", () => {
		const element = picture({
			src: "/a.jpg",
			alt: "A",
			width: 800,
			formats: ["webp"],
		});
		const types = [...element.querySelectorAll("source")].map((source) =>
			source.getAttribute("type"),
		);
		expect(types).toEqual(["image/webp"]);
	});
});
