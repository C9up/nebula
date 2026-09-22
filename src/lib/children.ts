/**
 * What a component accepts as content.
 *
 * Aurora's renderer already handles the whole union in a text slot: nested
 * templates, raw nodes, primitives, and arrays of any of those, with `null`,
 * `undefined` and `false` rendering nothing. `Child` names that union so a
 * component's props say what they mean instead of falling back to `unknown`,
 * and so passing a value the renderer would silently drop is a type error at
 * the call site rather than a blank space on the page.
 *
 * `Slot` is the reactive form. Content that changes must arrive as an accessor
 * — Aurora never re-renders a component, so a plain value read at setup is
 * frozen for the lifetime of the node.
 */

import type { TemplateResult } from "@c9up/aurora";
import type { Reactive } from "./props.js";

export type Child =
	| TemplateResult
	| Node
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly Child[];

/** Content that may be constant or recomputed. */
export type Slot = Reactive<Child>;

/**
 * The children of a component that PROVIDES context, as a function.
 *
 * A compound component — `Tooltip`, `Select`, `DropdownMenu` — shares its
 * state with its parts through Aurora's context, and context reaches only what
 * the provider creates inside its own setup. Aurora evaluates eagerly, so
 * children handed over already built ran before the provider existed:
 *
 *     Tooltip({ children: TooltipTrigger({ … }) })       // ✗ built too early
 *     Tooltip({ children: () => TooltipTrigger({ … }) }) // ✓ the setup calls it
 *
 * This is the aurora spelling of what JSX gets from deferring an element tree.
 * `Parts` names it so the type makes the requirement, rather than a blank
 * surface at runtime.
 *
 * Called ONCE, during setup — the structure of a compound component is fixed,
 * and its moving pieces are signals inside the parts.
 *
 * The same rule read from the other end: a part that READS context must be
 * built eagerly too, so it must not be hidden inside a `Slot`. `Slot` exists
 * for content that CHANGES, and the renderer calls it later, by which time
 * there is no context left to read:
 *
 *     DialogHeader({ children: html`${DialogTitle(…)}` })       // ✓ a value
 *     DialogHeader({ children: () => html`${DialogTitle(…)}` }) // ✗ too late
 *
 * So: write `() =>` for a component that PROVIDES (its type says `Parts`), and
 * a plain value everywhere else unless the content really does change.
 */
export type Parts = () => Child;

/**
 * Bind content into a template so it stays live.
 *
 * Returns the accessor form unchanged and wraps a constant in one. Templates
 * should always interpolate `${slot(props.children)}`: handing the renderer a
 * bare value works until a sibling prop makes the content dynamic, at which
 * point the binding quietly stops updating and nothing points at why.
 */
export function slot(content: Slot | undefined): () => Child {
	if (content === undefined) return () => null;
	return typeof content === "function" ? content : () => content;
}
