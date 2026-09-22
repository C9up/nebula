/**
 * Pagination — page links for a long list.
 *
 * The interesting part is `pageWindow`, which decides which page numbers to
 * show. Rendering all of them breaks at a few hundred pages; the usual fix is
 * a fixed window around the current page, which then jitters in width as you
 * approach either end — the control visibly reflows while you click through
 * it. `pageWindow` keeps the count constant instead, so the row stays the same
 * size from page 1 to page 500.
 *
 * `aria-current="page"` marks the current page. Without it the only signal is
 * the highlight, which a screen-reader user does not get.
 */

import { component, html } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MoreHorizontalIcon,
} from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";

export type PageSlot = number | null;

/**
 * Which page numbers to show, at a fixed total width.
 *
 * Always the first page, the last page, a run around the current one, and one
 * or two gaps — adding up to exactly `size` slots wherever the current page
 * sits. The constant width is the whole reason this is computed rather than a
 * range being sliced: a window that simply narrows near the ends makes the
 * control reflow as you click through it, and the buttons move under the
 * pointer.
 *
 * Near an end there is only one gap, so the run is one slot wider to make up
 * for it. That is the case a naive implementation gets wrong.
 */
export function pageWindow(
	page: number,
	pageCount: number,
	size = 7,
): readonly PageSlot[] {
	if (pageCount <= size) return range(1, pageCount);

	// Below five slots there is no room for first, last, a gap and a run, so
	// the shape this function promises cannot be built.
	const slots = Math.max(size, 5);
	const current = Math.min(Math.max(page, 1), pageCount);

	// Near an end the run absorbs the first (or last) page and there is a
	// single gap, so it holds `slots - 2` entries. In the middle the first and
	// last pages are separate and there are two gaps, leaving `slots - 4`.
	const runNearEnd = slots - 2;
	const runInMiddle = slots - 4;

	if (current <= runNearEnd - 1) {
		return [...range(1, runNearEnd), null, pageCount];
	}
	if (current >= pageCount - runNearEnd + 2) {
		return [1, null, ...range(pageCount - runNearEnd + 1, pageCount)];
	}

	const before = Math.floor((runInMiddle - 1) / 2);
	const start = current - before;
	return [1, null, ...range(start, start + runInMiddle - 1), null, pageCount];
}

function range(from: number, to: number): number[] {
	const out: number[] = [];
	for (let value = from; value <= to; value += 1) out.push(value);
	return out;
}

export interface PaginationProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const Pagination = component<PaginationProps>(
	(props) => html`<nav
		data-slot="pagination"
		role="navigation"
		aria-label="pagination"
		class="${() => cn("mx-auto flex w-full justify-center", read(props.class))}"
	>${slot(props.children)}</nav>`,
);

export const PaginationContent = component<PaginationProps>(
	(props) => html`<ul
		data-slot="pagination-content"
		class="${() => cn("flex flex-row items-center gap-1", read(props.class))}"
	>${slot(props.children)}</ul>`,
);

export const PaginationItem = component<PaginationProps>(
	(props) => html`<li
		data-slot="pagination-item"
	>${slot(props.children)}</li>`,
);

export interface PaginationLinkProps {
	children?: Slot;
	href?: string;
	/** The page the user is on. Carries `aria-current="page"`. */
	isActive?: Reactive<boolean>;
	size?: "default" | "icon";
	disabled?: Reactive<boolean>;
	onSelect?: (event: MouseEvent) => void;
	"aria-label"?: string;
	class?: Reactive<string>;
}

/**
 * One page link.
 *
 * An `<a>` whether or not it has an `href`, because that is what upstream
 * renders and what a pagination IS: a list of destinations. `onSelect`
 * intercepts only when it is given — with an `href` and no handler the link
 * must navigate normally, which is what makes a server-rendered pagination
 * work with JavaScript off.
 */
export const PaginationLink = component<PaginationLinkProps>((props) => {
	const active = (): boolean => read(props.isActive) === true;
	function onClick(event: MouseEvent): void {
		if (read(props.disabled) === true) {
			event.preventDefault();
			return;
		}
		if (props.onSelect === undefined) return;
		event.preventDefault();
		props.onSelect(event);
	}
	return html`<a
		data-slot="pagination-link"
		href="${props.href}"
		aria-current="${() => (active() ? "page" : undefined)}"
		aria-label="${props["aria-label"]}"
		aria-disabled="${() => (read(props.disabled) === true ? "true" : undefined)}"
		data-active="${() => (active() ? "true" : "false")}"
		class="${() =>
			cn(
				buttonVariants({
					variant: active() ? "outline" : "ghost",
					size: props.size ?? "icon",
				}),
				read(props.disabled) === true ? "pointer-events-none opacity-50" : "",
				read(props.class),
			)}"
		@click="${onClick}"
	>${slot(props.children)}</a>`;
});

export type PaginationStepProps = Omit<
	PaginationLinkProps,
	"size" | "isActive" | "aria-label"
>;

export const PaginationPrevious = component<PaginationStepProps>((props) =>
	PaginationLink({
		...props,
		size: "default",
		"aria-label": "Go to previous page",
		class: () => cn("gap-1 px-2.5 sm:pl-2.5", read(props.class)),
		children: html`${ChevronLeftIcon({})}<span class="hidden sm:block">Previous</span>`,
	}),
);

export const PaginationNext = component<PaginationStepProps>((props) =>
	PaginationLink({
		...props,
		size: "default",
		"aria-label": "Go to next page",
		class: () => cn("gap-1 px-2.5 sm:pr-2.5", read(props.class)),
		children: html`<span class="hidden sm:block">Next</span>${ChevronRightIcon({})}`,
	}),
);

export interface PaginationEllipsisProps {
	class?: Reactive<string>;
}

/** Stands in for the pages that did not fit — see `pageWindow`. */
export const PaginationEllipsis = component<PaginationEllipsisProps>(
	(props) => html`<span
		data-slot="pagination-ellipsis"
		aria-hidden="true"
		class="${() => cn("flex size-9 items-center justify-center", read(props.class))}"
	>${MoreHorizontalIcon({ class: "size-4" })}<span class="sr-only">More pages</span></span>`,
);
