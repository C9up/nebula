/**
 * Responsive image plumbing — the arithmetic behind `Image` and `Picture`.
 *
 * Everything here is pure: widths in, strings out. It lives apart from the
 * components because the interesting part of a responsive image is not the
 * markup, it is deciding *which* variants to offer the browser, and that
 * decision is worth testing without a DOM.
 *
 * **Where the bytes come from is not nebula's business.** A component that
 * imported an image processor would drag a native module into a package whose
 * only peer is Aurora, and would pin every app to one way of serving images.
 * So the URL is produced by a resolver the app installs once
 * ({@link setImageResolver}). The default one points at `/__image`, the
 * endpoint `@c9up/prism` registers; pointing it at a CDN instead is a
 * one-line change and no component notices.
 *
 * The resolver asks for a width, a format and a quality — never a height and
 * never a crop. Those three axes are the ones the server can safely allow-list,
 * which is what keeps an open transformation endpoint from becoming a cache
 * bomb. Cropping is `object-fit` on the element, where it costs nothing.
 */

/**
 * How an image responds to the width of its container.
 *
 * - `constrained` — scales down to fit, never past its declared width. The
 *   default, and what almost every image in a page wants.
 * - `full-width` — always the width of its container. Hero images, banners.
 * - `fixed` — the declared size, whatever the viewport. Logos, avatars,
 *   icons. Still offers a 2x variant for dense screens.
 * - `none` — no `srcset`, no `sizes`. An escape hatch for when the markup is
 *   being assembled by something else.
 */
export type ImageLayout = "constrained" | "full-width" | "fixed" | "none";

/** Output formats an image endpoint is expected to understand. */
export type ImageFormat = "avif" | "webp" | "jpeg" | "png";

/**
 * How the rendered box reconciles a different aspect ratio.
 *
 * These are the CSS `object-fit` values, and they are applied as CSS — the
 * image is never cropped server-side. A crop asked for through a URL is an
 * unbounded axis on a public endpoint, and the same result is one class here.
 */
export type ImageFit = "cover" | "contain" | "fill" | "none" | "scale-down";

/** Where the visible part sits when `fit` crops. CSS `object-position`. */
export type ImagePosition =
	| "center"
	| "top"
	| "bottom"
	| "left"
	| "right"
	| "top left"
	| "top right"
	| "bottom left"
	| "bottom right";

/** What a resolver is asked to produce one URL for. */
export interface ImageTransform {
	/** Target width in pixels. The server must not upscale past the source. */
	width: number;
	format?: ImageFormat;
	/** 1-100. The endpoint decides whether a given value is allowed. */
	quality?: number;
}

/** Turns a source and a transform into the URL to put in a `srcset`. */
export type ImageUrlResolver = (
	src: string,
	transform: ImageTransform,
) => string;

/**
 * Widths for elements that are not the width of a screen.
 *
 * Avatars, icons, thumbnails. Without them a 48px avatar's nearest offer is
 * 640 — thirteen times the pixels it can show — because every other ladder
 * starts at a phone's viewport.
 */
export const IMAGE_SIZES: readonly number[] = [
	16, 32, 48, 64, 96, 128, 256, 384,
];

/**
 * The widths worth generating, from real device pixel counts.
 *
 * Astro's ladder, close to the one Next.js settled on independently — which is
 * the reason to reuse it rather than invent one. They are device widths, not
 * round numbers: 828 is the iPhone XR, 1668 is an iPad. A tidier
 * `[400, 800, 1200, 1600]` misses every one of them and ships each device a
 * slightly-too-large image.
 *
 * Density is what makes the ladder cheap to round up to. The nearest rung
 * above 2400 here is 2560, six percent over; on a sparser ladder it would be
 * 3840.
 */
export const DEFAULT_RESOLUTIONS: readonly number[] = [
	640, // older and lower-end phones
	750, // iPhone 6-8
	828, // iPhone XR/11
	960, // older horizontal phones
	1080, // iPhone 6-8 Plus
	1280, // 720p
	1668, // various iPads
	1920, // 1080p
	2048, // QXGA
	2560, // WQXGA
	3200, // QHD+
	3840, // 4K
	4480, // 4.5K
	5120, // 5K
	6016, // 6K
];

/**
 * The ladder without the sizes only a desktop display asks for.
 *
 * Worth choosing deliberately for a full-width image: the top of
 * {@link DEFAULT_RESOLUTIONS} is eleven extra variants to store and warm, for
 * screens most sites see rarely.
 */
export const LIMITED_RESOLUTIONS: readonly number[] = [
	640, 750, 828, 1080, 1280, 1668, 2048, 2560,
];

/**
 * Every width a component may ask for, ascending.
 *
 * This list and the endpoint's allow-list are the same list, and that is the
 * contract between the two halves: a component that emits a width the endpoint
 * does not serve produces a `srcset` where every entry is a 400, and the page
 * silently falls back to the one `src`.
 *
 * It is also why a declared width is never emitted literally. `width: 1200`
 * asking for 1200 and 2400 would be two widths no allow-list contains, and
 * allow-listing whatever an author happens to type is not an allow-list.
 */
export function allSizes(breakpoints: readonly number[]): number[] {
	return [...new Set([...IMAGE_SIZES, ...breakpoints])].sort((a, b) => a - b);
}

/**
 * The smallest offered width that still covers `target`.
 *
 * Upwards, never downwards. Rounding down is how a 2x screen is handed an
 * image with fewer pixels than it can show, and the result is soft in a way
 * that is hard to attribute later. Falls back to the largest rung, which the
 * endpoint clamps to the source anyway.
 */
function snapUp(target: number, sizes: readonly number[]): number {
	return sizes.find((size) => size >= target) ?? sizes[sizes.length - 1] ?? 0;
}

/**
 * The width to actually request for a declared one.
 *
 * The `src` attribute and a density entry are single URLs rather than ladders,
 * and they are subject to the same contract: a literal declared width is a
 * width no allow-list contains.
 */
export function offeredWidth(
	width: number,
	breakpoints: readonly number[] = DEFAULT_RESOLUTIONS,
): number {
	return snapUp(width, allSizes(breakpoints));
}

export interface WidthsOptions {
	/** The declared display width. Required by every layout but `full-width`. */
	width?: number;
	layout: ImageLayout;
	/** Ladder to draw from. Defaults to {@link DEFAULT_RESOLUTIONS}. */
	breakpoints?: readonly number[];
	/**
	 * The source's own width, when it is known.
	 *
	 * Only a refinement: the endpoint must refuse to upscale anyway, so
	 * leaving it out costs a duplicate URL that serves the same bytes, never a
	 * blurry enlargement. Pass it and those duplicates disappear.
	 */
	originalWidth?: number;
}

/**
 * The widths to offer, ascending.
 *
 * Every value comes off {@link allSizes} — see there for why a declared width
 * is never emitted literally. 1x and 2x are always represented, rounded up, so
 * the common case of a dense screen at the declared width is never served
 * fewer pixels than it can show.
 */
export function imageWidths(options: WidthsOptions): number[] {
	const {
		width,
		layout,
		breakpoints = DEFAULT_RESOLUTIONS,
		originalWidth,
	} = options;

	const every = allSizes(breakpoints);

	/**
	 * Drop what the source cannot fill, but never return nothing.
	 *
	 * A source smaller than every rung still has to be offered at some width,
	 * and the endpoint clamps to the source rather than enlarging it.
	 */
	const withinSource = (candidates: number[]): number[] => {
		if (originalWidth === undefined) return candidates;
		const kept = candidates.filter((candidate) => candidate <= originalWidth);
		if (kept.length > 0) return kept;
		const smallest = candidates[0];
		return smallest === undefined ? [] : [smallest];
	};

	if (layout === "full-width") {
		return withinSource([...breakpoints]);
	}
	if (width === undefined || width <= 0) return [];

	const oneX = snapUp(width, every);
	const twoX = snapUp(width * 2, every);

	if (layout === "fixed") {
		return withinSource([...new Set([oneX, twoX])].sort((a, b) => a - b));
	}
	if (layout === "constrained") {
		// Below its declared width a constrained image is the width of the
		// viewport, so the viewport rungs under the cap earn their place. The
		// floor is the smallest device width: nothing narrower is a screen,
		// and offering 32w to an image that is at least 640 wide is noise in
		// every `srcset` on the page.
		const floor = breakpoints[0] ?? 0;
		const intermediate = every.filter((size) => size >= floor && size <= twoX);
		return withinSource(
			[...new Set([oneX, twoX, ...intermediate])].sort((a, b) => a - b),
		);
	}
	return [];
}

/**
 * The `sizes` attribute for a layout.
 *
 * Without it the browser assumes the image is the full width of the viewport
 * and picks the largest variant on every screen — which is the failure mode
 * where adding a `srcset` makes a page slower, not faster.
 */
export function imageSizes(options: {
	width?: number;
	layout: ImageLayout;
}): string | undefined {
	const { width, layout } = options;
	if (width === undefined || width <= 0) {
		return layout === "full-width" ? "100vw" : undefined;
	}
	switch (layout) {
		case "constrained":
			// Wider screen than the cap: the image stops at the cap. Narrower:
			// it is the screen.
			return `(min-width: ${width}px) ${width}px, 100vw`;
		case "fixed":
			return `${width}px`;
		case "full-width":
			return "100vw";
		default:
			return undefined;
	}
}

export interface SrcSetOptions {
	src: string;
	widths: readonly number[];
	format?: ImageFormat;
	quality?: number;
	/** Defaults to the installed resolver. */
	resolve?: ImageUrlResolver;
}

/** A `srcset` with `w` descriptors, or `undefined` when there is nothing to offer. */
export function imageSrcSet(options: SrcSetOptions): string | undefined {
	const { src, widths, format, quality, resolve = imageUrl } = options;
	if (widths.length === 0) return undefined;
	return widths
		.map((width) => `${resolve(src, { width, format, quality })} ${width}w`)
		.join(", ");
}

export interface DensitySrcSetOptions {
	src: string;
	/** The width at 1x. */
	width: number;
	/** Pixel ratios to serve, e.g. `[1, 2]`. */
	densities: readonly number[];
	format?: ImageFormat;
	quality?: number;
	originalWidth?: number;
	breakpoints?: readonly number[];
	resolve?: ImageUrlResolver;
}

/**
 * A `srcset` with `x` descriptors.
 *
 * The alternative to widths, never a companion to them: a `srcset` mixing `w`
 * and `x` descriptors is invalid, and browsers handle the mixture by ignoring
 * the whole attribute.
 */
export function densitySrcSet(
	options: DensitySrcSetOptions,
): string | undefined {
	const {
		src,
		width,
		densities,
		format,
		quality,
		originalWidth,
		breakpoints = DEFAULT_RESOLUTIONS,
		resolve = imageUrl,
	} = options;
	if (width <= 0 || densities.length === 0) return undefined;

	const seen = new Set<number>();
	const entries: string[] = [];
	for (const density of [...densities].sort((a, b) => a - b)) {
		if (density <= 0) continue;
		const target = offeredWidth(Math.round(width * density), breakpoints);
		if (originalWidth !== undefined && target > originalWidth) continue;
		if (seen.has(target)) continue;
		seen.add(target);
		entries.push(
			`${resolve(src, { width: target, format, quality })} ${density}x`,
		);
	}
	return entries.length === 0 ? undefined : entries.join(", ");
}

/**
 * Where the default resolver sends its requests.
 *
 * `__`-prefixed because it is the framework's route rather than the
 * application's, the same convention as `__assets` and `__relay`.
 */
let endpoint = "/__image";

/** Point the built-in resolver at a different path. */
export function setImageEndpoint(path: string): void {
	endpoint = path;
}

/**
 * The resolver used when an application installs none.
 *
 * Parameter names are one letter because they end up in every `srcset` entry
 * of every image on the page, and a `srcset` with fifteen entries repeats them
 * fifteen times.
 */
export const defaultImageResolver: ImageUrlResolver = (src, transform) => {
	const params = new URLSearchParams({
		src,
		w: String(Math.round(transform.width)),
	});
	if (transform.format !== undefined) params.set("f", transform.format);
	if (transform.quality !== undefined) {
		params.set("q", String(Math.round(transform.quality)));
	}
	return `${endpoint}?${params.toString()}`;
};

let resolver: ImageUrlResolver = defaultImageResolver;

/**
 * Install the resolver every image uses.
 *
 * Call it once at startup — from the app's entry on the client, and from the
 * same module on the server so SSR and hydration agree. They must agree: an
 * `src` that differs between the two makes the browser discard the image the
 * server already started fetching and request another.
 *
 * Passing `null` restores {@link defaultImageResolver}.
 */
export function setImageResolver(next: ImageUrlResolver | null): void {
	resolver = next ?? defaultImageResolver;
}

/** The resolver currently installed. */
export function getImageResolver(): ImageUrlResolver {
	return resolver;
}

/** Build one image URL through the installed resolver. */
export function imageUrl(src: string, transform: ImageTransform): string {
	return resolver(src, transform);
}

/** Tailwind classes for a layout. Height is always `auto` so the ratio holds. */
export function layoutClasses(layout: ImageLayout): string {
	switch (layout) {
		case "full-width":
			return "h-auto w-full";
		case "constrained":
			return "h-auto max-w-full";
		default:
			return "h-auto";
	}
}

const FIT_CLASSES: Readonly<Record<ImageFit, string>> = {
	cover: "object-cover",
	contain: "object-contain",
	fill: "object-fill",
	none: "object-none",
	"scale-down": "object-scale-down",
};

const POSITION_CLASSES: Readonly<Record<ImagePosition, string>> = {
	center: "object-center",
	top: "object-top",
	bottom: "object-bottom",
	left: "object-left",
	right: "object-right",
	"top left": "object-left-top",
	"top right": "object-right-top",
	"bottom left": "object-left-bottom",
	"bottom right": "object-right-bottom",
};

/** The `object-fit` class for a fit value. */
export function fitClass(fit: ImageFit | undefined): string | undefined {
	return fit === undefined ? undefined : FIT_CLASSES[fit];
}

/** The `object-position` class for a position value. */
export function positionClass(
	position: ImagePosition | undefined,
): string | undefined {
	return position === undefined ? undefined : POSITION_CLASSES[position];
}

/** The MIME type a `<source type>` needs for a format. */
export function mimeType(format: ImageFormat): string {
	return `image/${format}`;
}

const EXTENSIONS: Readonly<Record<string, ImageFormat>> = {
	avif: "avif",
	jpeg: "jpeg",
	jpg: "jpeg",
	png: "png",
	webp: "webp",
};

/**
 * The format a source's file name claims, if any.
 *
 * Used to pick the fallback of a `<picture>`: converting a PNG with
 * transparency to JPEG puts a black box behind it, so the fallback follows the
 * source rather than a fixed default. The extension is a claim, not proof —
 * only the server knows what the bytes really are, and it re-reads them.
 */
export function formatFromSource(src: string): ImageFormat | undefined {
	// Cut the query and fragment first, or `photo.png?v=2` has no extension.
	const path = src.split(/[?#]/, 1)[0] ?? "";
	const dot = path.lastIndexOf(".");
	if (dot === -1) return undefined;
	return EXTENSIONS[path.slice(dot + 1).toLowerCase()];
}
