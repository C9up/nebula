/**
 * Image — one `<img>`, with the attributes that make it fast already filled in.
 *
 * A bare `<img src>` costs a page twice: it ships desktop pixels to a phone,
 * and it reserves no space until it arrives, so everything under it jumps.
 * Both are solved by attributes nobody writes by hand — a `srcset` of a dozen
 * widths, a matching `sizes`, `width`/`height` for the ratio, `loading` and
 * `decoding`. This component writes them.
 *
 * The bytes come from whatever {@link setImageResolver} is pointed at; the
 * component only decides which variants to ask for. See `lib/image.ts` for
 * why the split is there and what the resolver is allowed to be asked.
 *
 * ```ts
 * Image({ src: "/photos/hero.jpg", alt: "…", width: 1200, height: 800 })
 * Image({ src: "/logo.png", alt: "…", width: 48, height: 48, layout: "fixed" })
 * Image({ src: "/banner.jpg", alt: "…", layout: "full-width", priority: true })
 * ```
 *
 * `alt` is required, and not as a gesture: the attribute is what a screen
 * reader announces, and an `<img>` without one is read out as its file name.
 * Decorative images pass `alt: ""`, which is the markup that says "skip me"
 * — a deliberate empty string, not a forgotten prop.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import {
	densitySrcSet,
	fitClass,
	type ImageFit,
	type ImageFormat,
	type ImageLayout,
	type ImagePosition,
	imageSizes,
	imageSrcSet,
	imageUrl,
	imageWidths,
	layoutClasses,
	positionClass,
} from "../lib/image.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface ImageProps {
	src: Reactive<string>;
	/** Required. `""` for a decorative image, which is what hides it. */
	alt: Reactive<string>;
	/**
	 * Displayed width in pixels, and the `width` attribute.
	 *
	 * Together with `height` it is what reserves the space before the bytes
	 * arrive. Optional only because `full-width` does not need it.
	 */
	width?: Reactive<number | undefined>;
	height?: Reactive<number | undefined>;
	/** Defaults to `constrained`. */
	layout?: Reactive<ImageLayout>;
	/** CSS `object-fit`. The image is never cropped server-side. */
	fit?: Reactive<ImageFit | undefined>;
	/** CSS `object-position`, for when `fit` crops. */
	position?: Reactive<ImagePosition | undefined>;
	/** Output format to request. Defaults to `webp`. */
	format?: Reactive<ImageFormat | undefined>;
	/** 1-100. The endpoint decides which values it accepts. */
	quality?: Reactive<number | undefined>;
	/** Override the generated width ladder. Pair it with `sizes`. */
	widths?: Reactive<readonly number[] | undefined>;
	/**
	 * Serve by pixel ratio instead of width, e.g. `[1, 2]`.
	 *
	 * Mutually exclusive with `widths` — a `srcset` mixing `w` and `x`
	 * descriptors is invalid, and a browser that sees one ignores the
	 * attribute entirely. `widths` wins if both are given.
	 */
	densities?: Reactive<readonly number[] | undefined>;
	/** Override the generated `sizes`. */
	sizes?: Reactive<string | undefined>;
	/** Width ladder to draw from. Defaults to the device-width ladder. */
	breakpoints?: Reactive<readonly number[] | undefined>;
	/** The source's own width, when known. Stops variants past it being offered. */
	originalWidth?: Reactive<number | undefined>;
	/**
	 * Above the fold: load it now.
	 *
	 * Sets `loading="eager"`, `decoding="sync"` and `fetchpriority="high"`
	 * together, because setting one without the others is the usual reason a
	 * hero image is still not the first thing painted.
	 */
	priority?: Reactive<boolean>;
	loading?: Reactive<"lazy" | "eager" | undefined>;
	decoding?: Reactive<"async" | "sync" | "auto" | undefined>;
	fetchPriority?: Reactive<"high" | "low" | "auto" | undefined>;
	class?: Reactive<string>;
}

/**
 * The widths this image offers, honouring an explicit `widths` prop.
 *
 * Exported because `Picture` needs exactly the same ladder for every one of
 * its `<source>` elements — computing it twice is how the AVIF and WebP
 * variants end up offering different sizes.
 */
export function resolvedWidths(props: ImageProps): number[] {
	const explicit = read(props.widths);
	if (explicit !== undefined) return [...explicit];
	return imageWidths({
		width: read(props.width),
		layout: readOr(props.layout, "constrained"),
		breakpoints: read(props.breakpoints),
		originalWidth: read(props.originalWidth),
	});
}

/** The `srcset` for one format, in whichever descriptor style applies. */
export function resolvedSrcSet(
	props: ImageProps,
	format: ImageFormat | undefined,
): string | undefined {
	const quality = read(props.quality);
	const width = read(props.width);
	const densities = read(props.densities);

	// `widths` wins: an explicit ladder is the more specific instruction, and
	// honouring both would emit the invalid mixed-descriptor set.
	if (densities !== undefined && read(props.widths) === undefined) {
		if (width === undefined) return undefined;
		return densitySrcSet({
			src: read(props.src),
			width,
			densities,
			format,
			quality,
			originalWidth: read(props.originalWidth),
		});
	}
	return imageSrcSet({
		src: read(props.src),
		widths: resolvedWidths(props),
		format,
		quality,
	});
}

/** The `sizes` for this image, or `undefined` when it carries `x` descriptors. */
export function resolvedSizes(props: ImageProps): string | undefined {
	const explicit = read(props.sizes);
	if (explicit !== undefined) return explicit;
	// Density srcsets describe themselves; a `sizes` alongside them means
	// nothing and browsers ignore it.
	if (read(props.densities) !== undefined && read(props.widths) === undefined) {
		return undefined;
	}
	return imageSizes({
		width: read(props.width),
		layout: readOr(props.layout, "constrained"),
	});
}

/**
 * The `src` a browser falls back to.
 *
 * The declared width rather than the largest variant: it is what a browser
 * with no `srcset` support (and every crawler that reads the attribute
 * literally) will fetch.
 */
export function resolvedSrc(
	props: ImageProps,
	format: ImageFormat | undefined,
): string {
	const src = read(props.src);
	const width = read(props.width);
	if (width === undefined) return src;
	return imageUrl(src, { width, format, quality: read(props.quality) });
}

/** The class list for the layout, fit and position of an image. */
export function imageClasses(props: ImageProps): string {
	return cn(
		layoutClasses(readOr(props.layout, "constrained")),
		fitClass(read(props.fit)),
		positionClass(read(props.position)),
		read(props.class),
	);
}

/** `loading`, `decoding` and `fetchpriority`, with `priority` applied. */
export function loadingAttributes(props: ImageProps): {
	loading: "lazy" | "eager";
	decoding: "async" | "sync" | "auto";
	fetchPriority: "high" | "low" | "auto" | undefined;
} {
	const priority = readOr(props.priority, false);
	return {
		loading: read(props.loading) ?? (priority ? "eager" : "lazy"),
		decoding: read(props.decoding) ?? (priority ? "sync" : "async"),
		fetchPriority: read(props.fetchPriority) ?? (priority ? "high" : undefined),
	};
}

export const Image = component<ImageProps>((props) => {
	const format = (): ImageFormat | undefined => read(props.format) ?? "webp";

	return html`<img
		data-slot="image"
		data-layout="${() => readOr(props.layout, "constrained")}"
		src="${() => resolvedSrc(props, format())}"
		srcset="${() => resolvedSrcSet(props, format())}"
		sizes="${() => resolvedSizes(props)}"
		alt="${() => read(props.alt)}"
		width="${() => read(props.width)}"
		height="${() => read(props.height)}"
		loading="${() => loadingAttributes(props).loading}"
		decoding="${() => loadingAttributes(props).decoding}"
		fetchpriority="${() => loadingAttributes(props).fetchPriority}"
		class="${() => imageClasses(props)}"
	/>`;
});
