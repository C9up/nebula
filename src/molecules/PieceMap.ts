/**
 * PieceMap — a transfer drawn as one small square per piece.
 *
 * What a torrent client shows under a download: each square is a piece of the
 * whole, coloured by where it stands — here, missing, on its way, taken from a
 * peer. A progress bar says how much; the map says *which*, and that is what
 * a stalled run, a missing layer or a peer serving one half shows at a glance.
 *
 * The states are the caller's, not a fixed set. A download, a replication and
 * a backup do not have the same ones, so the component takes a string type of
 * its own and a class per state — `tones` — and paints nothing it was not
 * told about. The legend reads the same `tones`, so a square and its key can
 * never drift apart.
 *
 * Pieces come in groups: each group after the first is set off by a rule — a
 * torrent's files, an image's layers. A flat map is one group.
 *
 * A generic function rather than `component<P>`, as DataTable: `State` has to
 * stay open so `tones` is checked against the caller's own states.
 *
 * With a `label`, the map is one image to assistive technology and the label
 * is what it says ("12 of 40 pieces"): a screen reader walking hundreds of
 * squares one by one learns nothing the sentence does not. Each square keeps
 * its `title` for the pointer.
 */

import { html, type TemplateResult } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { type Reactive, read } from "../lib/props.js";

export const pieceVariants = cva("inline-block shrink-0 rounded-[2px]", {
	variants: {
		size: {
			sm: "size-2",
			default: "size-2.5",
			lg: "size-3",
		},
	},
	defaultVariants: { size: "default" },
});

export type PieceVariants = VariantProps<typeof pieceVariants>;

export interface Piece<State extends string> {
	state: State;
	/** The square's tooltip: which piece, how big, from where. */
	title?: string;
}

export interface PieceMapProps<State extends string> {
	/**
	 * The pieces, group after group, or an accessor for pieces that change: the
	 * squares are drawn again whenever what it reads changes.
	 */
	groups: Reactive<readonly (readonly Piece<State>[])[]>;
	/** The classes that paint each state: a background, a border, a pulse. */
	tones: Readonly<Record<State, string>>;
	size?: Reactive<PieceVariants["size"]>;
	/** What the map says as a whole. Makes it one image; see above. */
	label?: Reactive<string | undefined>;
	class?: Reactive<string>;
}

export function PieceMap<State extends string>(
	props: PieceMapProps<State>,
): TemplateResult {
	return html`<div
		data-slot="piece-map"
		role="${() => (read(props.label) === undefined ? undefined : "img")}"
		aria-label="${() => read(props.label)}"
		class="${() => cn("flex flex-wrap gap-1", read(props.class))}"
	>
		${() =>
			read(props.groups).map(
				(pieces, index) => html`<span
					data-slot="piece-map-group"
					class="${cn("flex flex-wrap gap-0.5", index > 0 && "border-border border-s ps-1")}"
				>
					${pieces.map(
						(piece) => html`<span
							data-slot="piece"
							data-state="${piece.state}"
							title="${piece.title}"
							class="${cn(pieceVariants({ size: read(props.size) }), props.tones[piece.state])}"
						></span>`,
					)}
				</span>`,
			)}
	</div>`;
}

export interface PieceMapLegendItem<State extends string> {
	state: State;
	label: Child;
}

export interface PieceMapLegendProps<State extends string> {
	/** The same `tones` as the map's. */
	tones: Readonly<Record<State, string>>;
	/** The states to explain, in the order they are read. */
	items: readonly PieceMapLegendItem<State>[];
	/** Said before the keys — the size of the whole, say. */
	children?: Child;
	size?: Reactive<PieceVariants["size"]>;
	class?: Reactive<string>;
}

/** What the squares' colours mean. */
export function PieceMapLegend<State extends string>(
	props: PieceMapLegendProps<State>,
): TemplateResult {
	// A space after each key: the gap between them is only drawn, and without
	// one their labels run together for a screen reader and a copy.
	return html`<p
		data-slot="piece-map-legend"
		class="${() =>
			cn(
				"text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs",
				read(props.class),
			)}"
	>
		${props.children}
		${props.items.map(
			(item) => html`<span class="inline-flex items-center gap-1.5"
				><span
					aria-hidden="true"
					data-state="${item.state}"
					class="${() => cn(pieceVariants({ size: read(props.size) }), props.tones[item.state])}"
				></span
				>${item.label}</span
			> `,
		)}
	</p>`;
}
