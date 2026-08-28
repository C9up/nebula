/**
 * Marker — an inline annotation in a stream of content.
 *
 * "Yesterday", "3 unread", "Claude joined the conversation", "context
 * truncated". A line that is *about* the conversation rather than part of it.
 *
 * `role="separator"` when it carries no text, `role="status"` when it does.
 * The distinction matters: a bare rule between two days is structure and
 * should be announced as a boundary, while "context truncated" is information
 * the reader needs and would be lost as a separator.
 *
 * The rules on either side are `<span>`s with a border, not a `<hr>` — a
 * horizontal rule cannot sit either side of a label without absolute
 * positioning and a background colour matched to whatever is behind it, which
 * breaks the moment the surface changes.
 */

import { component, html } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { type Reactive, read } from "../lib/props.js";

export const markerVariants = cva(
	"flex w-full items-center gap-2 text-xs [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "text-muted-foreground",
				muted: "text-muted-foreground/70",
				destructive: "text-destructive",
			},
			align: {
				center: "justify-center",
				start: "justify-start",
			},
		},
		defaultVariants: { variant: "default", align: "center" },
	},
);

export type MarkerVariants = VariantProps<typeof markerVariants>;

export interface MarkerProps {
	/** The annotation. Omit for a plain rule. */
	label?: Child;
	icon?: Child;
	variant?: Reactive<MarkerVariants["variant"]>;
	align?: Reactive<MarkerVariants["align"]>;
	/** Draw rules either side of the label. Default `true`. */
	rules?: boolean;
	class?: Reactive<string>;
}

export const Marker = component<MarkerProps>((props) => {
	const hasLabel = props.label !== undefined;
	const withRules = props.rules !== false;
	const rule = html`<span aria-hidden="true" class="bg-border h-px flex-1"></span>`;

	return html`<div
		data-slot="marker"
		role="${hasLabel ? "status" : "separator"}"
		class="${() =>
			markerVariants({
				variant: read(props.variant),
				align: read(props.align),
				class: read(props.class),
			})}"
	>
		${withRules ? rule : null}
		${
			hasLabel
				? html`<span class="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
					>${props.icon}${props.label}</span
				>`
				: null
		}
		${withRules ? rule : null}
	</div>`;
});
