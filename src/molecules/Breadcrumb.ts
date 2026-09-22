/**
 * Breadcrumb — the trail back up the hierarchy.
 *
 *   Breadcrumb({ children: BreadcrumbList({ children: html`
 *     ${BreadcrumbItem({ children: BreadcrumbLink({ href: "/", children: "Home" }) })}
 *     ${BreadcrumbSeparator({})}
 *     ${BreadcrumbItem({ children: BreadcrumbPage({ children: "Settings" }) })}
 *   ` }) })
 *
 * Every part is presentational, so none of them takes `Parts` — there is no
 * context here to be inside of.
 *
 * `aria-label="breadcrumb"` on the `<nav>` and `aria-current="page"` on the
 * last entry. Both matter: the label is how a screen reader distinguishes this
 * navigation from the other landmarks on the page, and `aria-current` is what
 * tells the user which crumb is where they are — the visual weight change does
 * not carry that.
 *
 * The separators are `aria-hidden` and marked `role="presentation"`. Read
 * aloud, a chevron between every crumb is noise; the list structure already
 * conveys the sequence.
 */

import { component, html } from "@c9up/aurora";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronRightIcon, MoreHorizontalIcon } from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";

export interface BreadcrumbProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const Breadcrumb = component<BreadcrumbProps>(
	(props) => html`<nav
		data-slot="breadcrumb"
		aria-label="breadcrumb"
		class="${() => cn(read(props.class))}"
	>${slot(props.children)}</nav>`,
);

export const BreadcrumbList = component<BreadcrumbProps>(
	(props) => html`<ol
		data-slot="breadcrumb-list"
		class="${() =>
			cn(
				"text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5",
				read(props.class),
			)}"
	>${slot(props.children)}</ol>`,
);

export const BreadcrumbItem = component<BreadcrumbProps>(
	(props) => html`<li
		data-slot="breadcrumb-item"
		class="${() => cn("inline-flex items-center gap-1.5", read(props.class))}"
	>${slot(props.children)}</li>`,
);

export interface BreadcrumbLinkProps extends BreadcrumbProps {
	href?: string;
}

export const BreadcrumbLink = component<BreadcrumbLinkProps>(
	(props) => html`<a
		data-slot="breadcrumb-link"
		href="${props.href}"
		class="${() => cn("hover:text-foreground transition-colors", read(props.class))}"
	>${slot(props.children)}</a>`,
);

/**
 * The crumb for where you already are.
 *
 * `role="link"` with `aria-disabled` rather than an `<a>` without an `href`:
 * upstream's shape, and it keeps the crumb in the same role as its siblings so
 * a reader announces a consistent list.
 */
export const BreadcrumbPage = component<BreadcrumbProps>(
	(props) => html`<span
		data-slot="breadcrumb-page"
		role="link"
		aria-disabled="true"
		aria-current="page"
		class="${() => cn("text-foreground font-normal", read(props.class))}"
	>${slot(props.children)}</span>`,
);

/** The chevron. Defaults to one; give children to replace it. */
export const BreadcrumbSeparator = component<BreadcrumbProps>(
	(props) => html`<li
		data-slot="breadcrumb-separator"
		role="presentation"
		aria-hidden="true"
		class="${() => cn("[&>svg]:size-3.5", read(props.class))}"
	>${props.children === undefined ? ChevronRightIcon() : slot(props.children)}</li>`,
);

/** Stands in for ancestors that did not fit. */
export const BreadcrumbEllipsis = component<BreadcrumbProps>(
	(props) => html`<span
		data-slot="breadcrumb-ellipsis"
		role="presentation"
		aria-hidden="true"
		class="${() => cn("flex size-9 items-center justify-center", read(props.class))}"
	>${MoreHorizontalIcon({ class: "size-4" })}<span class="sr-only">More</span></span>`,
);
