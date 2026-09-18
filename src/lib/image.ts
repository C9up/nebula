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
 * The widths worth generating, from real device pixel counts.
 *
 * Both ladders are Astro's, and they are the same numbers Next.js settled on
 * independently — which is the reason to reuse them rather than invent a
 * ladder. They are device widths, not round numbers: 828 is the iPhone XR,
 * 1668 is an iPad. A tidier `[400, 800, 1200, 1600]` misses every one of them
 * and ships each device a slightly-too-large image.
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
 * `constrained` always carries 1x and 2x even when they fall between rungs of
 * the ladder — a dense screen at the declared width is the common case, and
 * leaving it to the nearest breakpoint is how a retina image ends up soft.
 */
export function imageWidths(options: WidthsOptions): number[] {
	const {
		width,
		layout,
		breakpoints = DEFAULT_RESOLUTIONS,
		originalWidth,
	} = options;

	const fitsSource = (candidate: number): boolean =>
		originalWidth === undefined || candidate <= originalWidth;

	if (layout === "full-width") {
		return [...breakpoints].filter(fitsSource);
	}
	if (width === undefined || width <= 0) return [];

	const double = width * 2;
	const ceiling =
		originalWidth === undefined ? double : Math.min(double, originalWidth);

	if (layout === "fixed") {
		if (originalWidth !== undefined && width > originalWidth) {
			return [originalWidth];
		}
		return width === ceiling ? [width] : [width, ceiling];
	}
	if (layout === "constrained") {
		// `ceiling` is in the list on purpose, and this is where we part from
		// the ladder-and-filter every other implementation uses. A 500px
		// source displayed at 400 filters to `[400]`: 800 is past the source,
		// and the next rung down is 640, also past it. So a dense screen is
		// handed 400px upscaled while the 500 it could have had sits on disk.
		// Offering the ceiling costs one variant and only ever differs when
		// the source falls between 1x and 2x.
		const candidates = [width, double, ceiling, ...breakpoints].filter(
			(candidate) => candidate <= ceiling,
		);
		return [...new Set(candidates)].sort((a, b) => a - b);
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
		resolve = imageUrl,
	} = options;
	if (width <= 0 || densities.length === 0) return undefined;

	const seen = new Set<number>();
	const entries: string[] = [];
	for (const density of [...densities].sort((a, b) => a - b)) {
		if (density <= 0) continue;
		const target = Math.round(width * density);
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
