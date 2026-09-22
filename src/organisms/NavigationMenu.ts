/**
 * NavigationMenu — a site's top-level navigation, with panels.
 *
 *   NavigationMenu({ children: () => NavigationMenuList({ children: html`
 *     ${NavigationMenuItem({ children: () => html`
 *       ${NavigationMenuTrigger({ children: "Products" })}
 *       ${NavigationMenuContent({ children: () => html`
 *         ${NavigationMenuLink({ href: "/a", children: "Analytics" })}
 *       ` })}
 *     ` })}
 *     ${NavigationMenuItem({ children: () =>
 *       NavigationMenuLink({ href: "/pricing", children: "Pricing" })
 *     })}
 *   ` }) })
 *
 * One surface for the whole bar, as in `Menubar`: only one panel is ever open,
 * and moving between triggers is a change of anchor and contents rather than a
 * close and an open.
 *
 * The delays are what make it usable with a pointer. Opening waits, so
 * crossing the bar does not flash every panel on the way; closing waits
 * longer, so travelling diagonally from a trigger into its panel does not
 * dismiss it halfway. A plain link closes an open panel on hover, because the
 * pointer has left that branch of the bar.
 */

import {
	component,
	createContext,
	html,
	inject,
	onUnmount,
	provide,
	signal,
	type TemplateResult,
} from "@c9up/aurora";
import type { Child, Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronDownIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { slideInFromSide, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { floatingSurface } from "../primitives/floatingSurface.js";

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 250;

export const triggerClasses =
	"group bg-background hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-ring/50 data-[state=open]:bg-accent/50 inline-flex h-9 w-max items-center justify-center gap-1 rounded-md px-4 py-2 text-sm font-medium transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50";

interface PanelRegistration {
	readonly triggerId: string;
	body: Child;
	panelClass: Reactive<string> | undefined;
}

interface NavigationMenuApi {
	readonly contentId: string;
	claim(triggerId: string): number;
	describe(index: number, patch: Partial<PanelRegistration>): void;
	readonly openIndex: () => number;
	/** After the open delay, unless `immediate`. */
	scheduleOpen(index: number, immediate: boolean): void;
	scheduleClose(): void;
	cancelPending(): void;
	close(): void;
}

const NavigationMenuContext =
	createContext<NavigationMenuApi>("NavigationMenu");

interface NavigationMenuItemApi {
	readonly index: number;
	readonly triggerId: string;
}

const NavigationMenuItemContext =
	createContext<NavigationMenuItemApi>("NavigationMenuItem");

export interface NavigationMenuProps {
	class?: Reactive<string>;
	children?: Parts;
}

export const NavigationMenu = component<NavigationMenuProps>((props) => {
	const contentId = uid("navigation-menu-content");
	const panels: PanelRegistration[] = [];
	const openIndex = signal(-1);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function cancelPending(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
	}

	function schedule(index: number, delay: number): void {
		cancelPending();
		if (delay === 0) {
			openIndex(index);
			return;
		}
		timer = setTimeout(() => openIndex(index), delay);
	}

	function close(): void {
		cancelPending();
		openIndex(-1);
	}

	onUnmount(cancelPending);

	provide<NavigationMenuApi>(NavigationMenuContext, {
		contentId,
		claim(triggerId) {
			panels.push({ triggerId, body: null, panelClass: undefined });
			return panels.length - 1;
		},
		describe(index, patch) {
			const entry = panels[index];
			if (entry === undefined) return;
			Object.assign(entry, patch);
		},
		openIndex: () => openIndex(),
		scheduleOpen: (index, immediate) =>
			schedule(index, immediate ? 0 : OPEN_DELAY_MS),
		scheduleClose: () => schedule(-1, CLOSE_DELAY_MS),
		cancelPending,
		close,
	});

	const parts = props.children?.();

	floatingSurface({
		anchor: () => {
			const entry = panels[openIndex()];
			return entry === undefined
				? null
				: document.getElementById(entry.triggerId);
		},
		open: () => openIndex() !== -1,
		onClose: close,
		placement: "bottom-start",
		offset: 6,
		content: () =>
			renderPanel(panels[openIndex()], contentId, {
				enter: cancelPending,
				leave: () => schedule(-1, CLOSE_DELAY_MS),
			}),
	});

	return html`<nav
		data-slot="navigation-menu"
		class="${() =>
			cn(
				"group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
				read(props.class),
			)}"
	>${parts}</nav>`;
});

export interface NavigationMenuListProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const NavigationMenuList = component<NavigationMenuListProps>(
	(props) => html`<ul
		data-slot="navigation-menu-list"
		class="${() =>
			cn(
				"group flex flex-1 list-none items-center justify-center gap-1",
				read(props.class),
			)}"
	>${slot(props.children)}</ul>`,
);

export interface NavigationMenuItemProps {
	children?: Parts;
	class?: Reactive<string>;
}

/**
 * One entry in the bar.
 *
 * Claims a panel slot as it is built, whether or not it holds one: the index
 * is what the trigger and the content use to find each other, and an item that
 * is only a link simply never fills its slot.
 */
export const NavigationMenuItem = component<NavigationMenuItemProps>(
	(props) => {
		const menu = inject(NavigationMenuContext);
		const triggerId = uid("navigation-menu-trigger");
		const index = menu.claim(triggerId);
		provide<NavigationMenuItemApi>(NavigationMenuItemContext, {
			index,
			triggerId,
		});
		return html`<li
			data-slot="navigation-menu-item"
			class="${() => cn("relative", read(props.class))}"
		>${props.children?.()}</li>`;
	},
);

export interface NavigationMenuTriggerProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const NavigationMenuTrigger = component<NavigationMenuTriggerProps>(
	(props) => {
		const menu = inject(NavigationMenuContext);
		const item = inject(NavigationMenuItemContext);
		const open = (): boolean => menu.openIndex() === item.index;

		function onKeyDown(event: KeyboardEvent): void {
			if (
				event.key === "ArrowDown" ||
				event.key === "Enter" ||
				event.key === " "
			) {
				event.preventDefault();
				menu.scheduleOpen(item.index, true);
			}
		}

		return html`<button
			type="button"
			data-slot="navigation-menu-trigger"
			id="${item.triggerId}"
			aria-expanded="${() => (open() ? "true" : "false")}"
			aria-controls="${() => (open() ? menu.contentId : undefined)}"
			data-state="${() => (open() ? "open" : "closed")}"
			class="${() => cn(triggerClasses, read(props.class))}"
			@click="${() =>
				open() ? menu.close() : menu.scheduleOpen(item.index, true)}"
			@pointerenter="${() => menu.scheduleOpen(item.index, false)}"
			@pointerleave="${() => menu.scheduleClose()}"
			@keydown="${onKeyDown}"
		>${slot(props.children)}${ChevronDownIcon({
			class:
				"relative top-px size-3 transition-transform duration-200 group-data-[state=open]:rotate-180",
		})}</button>`;
	},
);

export interface NavigationMenuContentProps {
	children?: Parts;
	class?: Reactive<string>;
}

export const NavigationMenuContent = component<NavigationMenuContentProps>(
	(props) => {
		const menu = inject(NavigationMenuContext);
		const item = inject(NavigationMenuItemContext);
		menu.describe(item.index, {
			body: props.children?.(),
			panelClass: props.class,
		});
		return html``;
	},
);

export interface NavigationMenuLinkProps {
	children?: Slot;
	href?: string;
	/** The page the user is on. */
	active?: Reactive<boolean>;
	class?: Reactive<string>;
}

export const NavigationMenuLink = component<NavigationMenuLinkProps>(
	(props) => {
		const menu = inject(NavigationMenuContext);
		return html`<a
			data-slot="navigation-menu-link"
			href="${props.href}"
			data-active="${() => (read(props.active) === true ? "true" : undefined)}"
			aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
			class="${() =>
				cn(
					"hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-ring/50 data-[active=true]:bg-accent/50 data-[active=true]:focus:bg-accent data-[active=true]:hover:bg-accent flex flex-col gap-1 rounded-sm p-2 text-sm transition-all outline-none focus-visible:ring-[3px] focus-visible:outline-1 [&_svg:not([class*='size-'])]:size-4",
					read(props.class),
				)}"
			@pointerenter="${() => {
				// Hovering a link in the BAR while a panel is open closes it: the
				// pointer has left that branch. A link inside the panel is harmless
				// — the panel's own `pointerenter` has already cancelled the close.
				if (menu.openIndex() !== -1) menu.scheduleClose();
			}}"
		>${slot(props.children)}</a>`;
	},
);

export interface NavigationMenuViewportProps {
	class?: Reactive<string>;
}

/**
 * Where the panel is drawn.
 *
 * NAMED DEVIATION — inert here. Radix renders every panel into one viewport
 * element positioned under the bar, which is what its width and height
 * animations interpolate against. The panel is portalled and positioned by
 * `floatingSurface` instead, so this exists for a layout copied from upstream
 * to keep its shape rather than to hold anything.
 */
export const NavigationMenuViewport = component<NavigationMenuViewportProps>(
	(props) => html`<div
			data-slot="navigation-menu-viewport"
			class="${() =>
				cn(
					"absolute top-full left-0 isolate z-50 flex justify-center",
					read(props.class),
				)}"
		></div>`,
);

export interface NavigationMenuIndicatorProps {
	class?: Reactive<string>;
}

/** The arrow that points at the open trigger. */
export const NavigationMenuIndicator = component<NavigationMenuIndicatorProps>(
	(props) => {
		const menu = inject(NavigationMenuContext);
		return html`<div
			data-slot="navigation-menu-indicator"
			data-state="${() => (menu.openIndex() === -1 ? "hidden" : "visible")}"
			class="${() =>
				cn(
					"top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in",
					read(props.class),
				)}"
		><div class="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md"></div></div>`;
	},
);

interface PanelHandlers {
	enter(): void;
	leave(): void;
}

function renderPanel(
	entry: PanelRegistration | undefined,
	contentId: string,
	handlers: PanelHandlers,
): TemplateResult {
	return html`<div
		data-slot="navigation-menu-content"
		id="${contentId}"
		class="${cn(
			"bg-popover text-popover-foreground z-50 origin-(--nebula-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
			zoomInOut,
			slideInFromSide,
			read(entry?.panelClass),
		)}"
		@pointerenter="${() => handlers.enter()}"
		@pointerleave="${() => handlers.leave()}"
	>${entry?.body}</div>`;
}
