/**
 * Picture — the same image in several formats, browser picks the first it can.
 *
 * `Image` asks for one format and trusts it to be supported. That is fine for
 * WebP, which every current browser reads. It is not fine for AVIF, which is
 * 20-30% smaller again and still not universal — so AVIF can only be offered
 * *alongside* a fallback, which is what `<picture>` is for.
 *
 * ```ts
 * Picture({ src: "/photos/hero.jpg", alt: "…", width: 1200, height: 800 })
 * ```
 *
 * renders a `<source type="image/avif">`, a `<source type="image/webp">` and
 * the original as the `<img>` underneath. The browser takes the first `type`
 * it understands; one that understands none takes the `<img>`, which is also
 * what a crawler reads.
 *
 * The `<img>` is `Image` itself, with every prop forwarded. That is what makes
 * this a molecule rather than an atom, and it is deliberate: the `srcset`
 * arithmetic, the `sizes`, the loading attributes and the layout classes have
 * exactly one implementation, so a `<source>` can never end up offering a
 * different ladder than the `<img>` beneath it.
 */

import { component, html } from "@c9up/aurora";
import {
	Image,
	type ImageProps,
	resolvedSizes,
	resolvedSrcSet,
} from "../atoms/Image.js";
import { formatFromSource, type ImageFormat, mimeType } from "../lib/image.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface PictureProps extends ImageProps {
	/**
	 * Formats to offer above the fallback, best first.
	 *
	 * Order is the whole contract: a browser takes the first `type` it
	 * supports without comparing sizes, so listing WebP before AVIF means no
	 * browser ever receives the smaller file.
	 */
	formats?: Reactive<readonly ImageFormat[]>;
	/**
	 * Format of the `<img>` underneath.
	 *
	 * Defaults to what the source's extension claims, falling back to JPEG.
	 * Following the source matters for PNG: a transparent logo flattened to
	 * JPEG arrives with a black background, and the fallback is exactly the
	 * path taken by the browsers least likely to be checked.
	 */
	fallbackFormat?: Reactive<ImageFormat | undefined>;
}

const DEFAULT_FORMATS: readonly ImageFormat[] = ["avif", "webp"];

/**
 * The format for the `<img>`, never one of the modern ones.
 *
 * A fallback in a format the `<source>` elements already cover is not a
 * fallback — a browser that cannot read AVIF or WebP would be handed WebP.
 */
function fallbackOf(props: PictureProps): ImageFormat {
	const explicit = read(props.fallbackFormat);
	if (explicit !== undefined) return explicit;
	const claimed = formatFromSource(read(props.src));
	return claimed === "png" ? "png" : "jpeg";
}

export const Picture = component<PictureProps>((props) => {
	const formats = (): readonly ImageFormat[] =>
		readOr(props.formats, DEFAULT_FORMATS);

	return html`<picture data-slot="picture">
		${() =>
			formats().map((format) => {
				const srcset = resolvedSrcSet(props, format);
				// A layout that generates no ladder (`none`, or a `fixed`
				// image with no width) leaves nothing for a `<source>` to
				// point at, and an empty `srcset` makes the browser pick that
				// source and render nothing.
				if (srcset === undefined) return null;
				return html`<source
					data-slot="picture-source"
					type="${mimeType(format)}"
					srcset="${srcset}"
					sizes="${() => resolvedSizes(props)}"
				/>`;
			})}
		${() => Image({ ...props, format: fallbackOf(props) })}
	</picture>`;
});
