/**
 * Bubble — conversational content in a speech bubble.
 *
 * Alignment is **logical**, not physical: `align: "end"` uses `ms-auto` and an
 * inline-end tail, so the same message sits on the right in English and on the
 * left in Arabic without the caller knowing which. Writing `ml-auto` here would
 * have been shorter and would have put every outgoing message on the wrong side
 * of an RTL conversation.
 *
 * The collapse is `line-clamp` plus a toggle rather than a max-height with
 * overflow hidden. `line-clamp` cuts at a line boundary and adds the ellipsis
 * itself; a height cut slices through the middle of a line of text, which is
 * the tell of a hand-rolled version.
 *
 * Reactions are a `<ul>`, and each one is a toggle button with
 * `aria-pressed` — not a decorative span. A reaction the user can add is a
 * control, and a count nobody can operate belongs in the message text.
 */

import { component, html, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { type Reactive, read } from "../lib/props.js";

export const bubbleVariants = cva(
	"relative w-fit max-w-[min(36rem,80%)] rounded-lg px-3 py-2 text-sm break-words",
	{
		variants: {
			variant: {
				default: "bg-muted text-foreground",
				accent: "bg-primary text-primary-foreground",
				outline: "border bg-background text-foreground",
				ghost: "text-foreground px-0",
			},
			align: {
				// Logical margins, so the side follows the writing direction.
				start: "me-auto",
				end: "ms-auto",
			},
		},
		defaultVariants: { variant: "default", align: "start" },
	},
);

export type BubbleVariants = VariantProps<typeof bubbleVariants>;

export interface BubbleReaction {
	emoji: string;
	count?: number;
	/** The current user has reacted with this one. */
	active?: boolean;
	onToggle?: () => void;
}

export interface BubbleProps {
	children?: Slot;
	variant?: Reactive<BubbleVariants["variant"]>;
	align?: Reactive<BubbleVariants["align"]>;
	reactions?: readonly BubbleReaction[];
	/** Clamp long content behind a toggle. */
	collapsible?: boolean;
	/** Lines shown while collapsed. Default `6`. */
	collapsedLines?: number;
	/** Label for the expand toggle. Default `"Show more"`. */
	expandLabel?: string;
	collapseLabel?: string;
	class?: Reactive<string>;
}

export const Bubble = component<BubbleProps>((props) => {
	const expanded = signal(false);
	const lines = props.collapsedLines ?? 6;

	const bodyClass = (): string => {
		if (props.collapsible !== true || expanded()) return "";
		// An arbitrary value, because line-clamp-N only exists for 1–6 and the
		// caller can ask for any depth.
		return `line-clamp-[${lines}]`;
	};

	return html`<div
		data-slot="bubble"
		class="${() =>
			bubbleVariants({
				variant: read(props.variant),
				align: read(props.align),
				class: read(props.class),
			})}"
	>
		<div data-slot="bubble-content" class="${bodyClass}">${slot(props.children)}</div>
		${
			props.collapsible !== true
				? null
				: html`<button
					type="button"
					data-slot="bubble-toggle"
					aria-expanded="${() => (expanded() ? "true" : "false")}"
					class="mt-1 text-xs font-medium underline-offset-4 hover:underline"
					@click="${() => expanded(!expanded())}"
				>${() =>
					expanded()
						? (props.collapseLabel ?? "Show less")
						: (props.expandLabel ?? "Show more")}</button>`
		}
		${
			props.reactions === undefined || props.reactions.length === 0
				? null
				: html`<ul data-slot="bubble-reactions" class="mt-1.5 flex flex-wrap gap-1">
					${props.reactions.map(renderReaction)}
				</ul>`
		}
	</div>`;
});

function renderReaction(reaction: BubbleReaction): Child {
	return html`<li>
		<button
			type="button"
			data-slot="bubble-reaction"
			aria-pressed="${reaction.active === true ? "true" : "false"}"
			aria-label="${`${reaction.emoji}${reaction.count === undefined ? "" : `, ${reaction.count}`}`}"
			class="bg-background/60 hover:bg-background aria-pressed:border-primary aria-pressed:bg-primary/10 flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs transition-colors"
			@click="${() => reaction.onToggle?.()}"
		>
			<span aria-hidden="true">${reaction.emoji}</span>
			${
				reaction.count === undefined
					? null
					: html`<span class="tabular-nums">${reaction.count}</span>`
			}
		</button>
	</li>`;
}
