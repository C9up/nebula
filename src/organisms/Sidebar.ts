/**
 * Sidebar — the application shell's navigation column.
 *
 * Two presentations from one definition, because a sidebar is not a component
 * so much as a layout decision that changes with the viewport:
 *
 * - On a wide screen it is a column beside the content, collapsible to a strip
 *   of icons or away entirely.
 * - On a narrow one it is a Sheet. A 16rem column on a phone leaves nothing
 *   for the content, and every attempt to keep it visible ends up as a drawer
 *   anyway.
 *
 * The collapsed state is persisted in a cookie rather than `localStorage`. The
 * server renders the shell, and only a cookie is readable there — with
 * `localStorage` the sidebar renders expanded, then snaps shut once the client
 * hydrates, which is visible on every page load.
 *
 * `cmd/ctrl + B` toggles it, the convention from every editor that has one.
 */

import {
	booleanCookie,
	component,
	cookieState,
	html,
	onMount,
	onUnmount,
	type Signal,
	signal,
} from "@c9up/aurora";
import { Button } from "../atoms/Button.js";
import type { Child, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { PanelLeftIcon } from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";
import { type StyledProps, styledDiv } from "../lib/styled.js";
import { Sheet } from "./Sheet.js";
import { Tooltip } from "./Tooltip.js";

const COOKIE_NAME = "nebula:sidebar";

/**
 * The open/collapsed state, shared by every part of the sidebar.
 *
 * shadcn publishes this through a `SidebarProvider` and React context, so that
 * a menu item three levels down can know the sidebar is collapsed and show a
 * tooltip instead of a label. Aurora has no context, and the honest
 * replacement is a module-level signal: an app has one sidebar, so one signal
 * is the whole of what the provider was carrying.
 *
 * Created on first use rather than at import, because `cookieState` reads the
 * cookie immediately and this module is imported during SSR too.
 */
let sharedOpen: Signal<boolean> | undefined;

export function sidebarState(defaultOpen = true): Signal<boolean> {
	sharedOpen ??= cookieState(COOKIE_NAME, defaultOpen, booleanCookie, {
		path: "/",
		maxAge: COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
		sameSite: "lax",
	});
	return sharedOpen;
}

/** Is the sidebar collapsed to its icon rail right now? */
export function sidebarCollapsed(): boolean {
	return !sidebarState()();
}
const COOKIE_MAX_AGE_DAYS = 365;
/** Below this width the sidebar becomes a Sheet. Matches Tailwind's `md`. */
const MOBILE_BREAKPOINT = 768;

export interface SidebarProps {
	children?: Slot;
	header?: Slot;
	footer?: Slot;
	/** Which edge. Default `"left"`. */
	side?: "left" | "right";
	/** What collapsing does: shrink to icons, or disappear. Default `"icon"`. */
	collapsible?: "icon" | "offcanvas";
	/** Starting state. Read from the cookie when there is one. */
	defaultOpen?: boolean;
	/** Announced as the navigation landmark's name. */
	label?: string;
	class?: Reactive<string>;
}

export const Sidebar = component<SidebarProps>((props) => {
	const side = props.side ?? "left";
	const collapsible = props.collapsible ?? "icon";
	// The shared signal, so the menu items collapse in step with the panel.
	const open = sidebarState(props.defaultOpen ?? true);
	const mobile = signal(false);

	function toggle(): void {
		open(!open());
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== "b" && event.key !== "B") return;
		if (!event.metaKey && !event.ctrlKey) return;
		event.preventDefault();
		toggle();
	}

	// `matchMedia` rather than a resize listener: it fires only when the
	// breakpoint is actually crossed, not on every pixel of a window drag.
	let media: MediaQueryList | undefined;
	function syncMobile(): void {
		mobile(media?.matches === true);
	}

	onMount(() => {
		media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		syncMobile();
		media.addEventListener("change", syncMobile);
		document.addEventListener("keydown", onKeyDown);
	});

	onUnmount(() => {
		media?.removeEventListener("change", syncMobile);
		document.removeEventListener("keydown", onKeyDown);
	});

	const body = (): Child =>
		html`<div data-slot="sidebar-inner" class="flex h-full w-full flex-col">
			${
				props.header === undefined
					? null
					: html`<div data-slot="sidebar-header" class="flex flex-col gap-2 p-2">
						${slot(props.header)}
					</div>`
			}
			<div data-slot="sidebar-body" class="min-h-0 flex-1 overflow-auto p-2">
				${slot(props.children)}
			</div>
			${
				props.footer === undefined
					? null
					: html`<div data-slot="sidebar-footer" class="flex flex-col gap-2 p-2">
						${slot(props.footer)}
					</div>`
			}
		</div>`;

	return html`<div data-slot="sidebar-root">
		${() =>
			mobile()
				? Sheet({
						title: props.label ?? "Navigation",
						srOnlyTitle: true,
						side,
						open: () => open(),
						onOpenChange: (next) => open(next),
						children: body(),
						contentClass: "bg-sidebar text-sidebar-foreground w-[18rem] p-0",
					})
				: html`<nav
						data-slot="sidebar"
						data-state="${() => (open() ? "expanded" : "collapsed")}"
						data-side="${side}"
						data-collapsible="${collapsible}"
						aria-label="${props.label ?? "Sidebar"}"
						class="${() =>
							cn(
								"bg-sidebar text-sidebar-foreground h-svh shrink-0 overflow-hidden transition-[width] duration-200 ease-linear motion-reduce:transition-none",
								side === "left" ? "border-r" : "border-l",
								open()
									? "w-(--sidebar-width,16rem)"
									: collapsible === "icon"
										? "w-(--sidebar-width-icon,3rem)"
										: "w-0 border-0",
								read(props.class),
							)}"
					>${body()}</nav>`}
	</div>`;
});

export interface SidebarTriggerProps {
	onToggle: () => void;
	class?: Reactive<string>;
}

/**
 * The button that opens and closes the sidebar.
 *
 * Kept apart from `Sidebar` because it belongs in the page header, not in the
 * panel — a trigger inside an off-canvas sidebar disappears with it, and there
 * is then no way back.
 */
export const SidebarTrigger = component<SidebarTriggerProps>((props) => {
	return Button({
		variant: "ghost",
		size: "icon",
		label: "Toggle sidebar",
		class: props.class,
		onClick: props.onToggle,
		children: PanelLeftIcon({ class: "size-4" }),
	});
});

export const SidebarGroup = styledDiv(
	"sidebar-group",
	"flex w-full flex-col gap-1 p-2",
);

export const SidebarGroupLabel = styledDiv(
	"sidebar-group-label",
	"text-sidebar-foreground/70 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium",
);

export const SidebarMenu = styledDiv(
	"sidebar-menu",
	"flex w-full min-w-0 flex-col gap-1",
);

export interface SidebarMenuItemProps {
	label: Child;
	href?: string;
	icon?: Child;
	active?: Reactive<boolean>;
	/**
	 * Shown as a tooltip while the sidebar is collapsed to icons.
	 *
	 * Only then: an entry whose label is already on screen does not need the
	 * same words repeated on hover. Without it a collapsed rail is a column of
	 * unlabelled glyphs, so give one to every entry that has an icon.
	 */
	tooltip?: string;
	/** A trailing control — the count of unread items, a status dot. */
	badge?: Child;
	onClick?: () => void;
}

/**
 * One navigation entry.
 *
 * `aria-current="page"` on the active entry, not just a highlight class. The
 * highlight tells a sighted user where they are; without the attribute nobody
 * else is told at all.
 */
export const SidebarMenuItem = component<SidebarMenuItemProps>((props) => {
	const classes =
		"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium flex h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:shrink-0";

	/**
	 * The label and badge fold away with the rail, the icon does not.
	 *
	 * `sr-only` rather than `hidden`: the entry keeps its accessible name when
	 * collapsed, so a screen reader still reads "Settings" off a column that
	 * shows only a cog.
	 */
	const foldable = (): string => (sidebarCollapsed() ? "sr-only" : "truncate");

	const body = html`${props.icon}<span class="${foldable}">${props.label}</span>${() =>
		props.badge === undefined || sidebarCollapsed()
			? null
			: html`<span
					data-slot="sidebar-menu-badge"
					class="text-sidebar-foreground/70 ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums"
				>${props.badge}</span>`}`;

	const entry =
		props.href !== undefined
			? html`<a
					data-slot="sidebar-menu-item"
					href="${props.href}"
					aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
					class="${classes}"
				>${body}</a>`
			: html`<button
					type="button"
					data-slot="sidebar-menu-item"
					aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
					class="${classes}"
					@click="${props.onClick}"
				>${body}</button>`;

	if (props.tooltip === undefined) return entry;

	// Wrapped once, not toggled: swapping the wrapper on collapse would remount
	// the entry and lose focus mid-keyboard-navigation. The tooltip decides for
	// itself whether to open, which is the cheaper half to make conditional.
	return html`${() =>
		sidebarCollapsed()
			? Tooltip({ trigger: entry, content: props.tooltip, placement: "right" })
			: entry}`;
});

/**
 * A second control on a menu row — a "more" menu, a remove button.
 *
 * Absolutely positioned rather than a flex sibling, so it can overlap a long
 * label instead of squeezing it. It disappears with the rail: there is no room
 * for two controls in an icon-width column, and the row's own action is the
 * one that matters.
 */
export const SidebarMenuAction = component<SidebarMenuItemProps>((props) => {
	return html`<button
		type="button"
		data-slot="sidebar-menu-action"
		aria-label="${props.tooltip}"
		class="${() =>
			cn(
				"text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-1 right-1 flex aspect-square w-5 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:shrink-0",
				sidebarCollapsed() ? "hidden" : "",
			)}"
		@click="${props.onClick}"
	>${props.icon ?? props.label}</button>`;
});

/**
 * A nested list under a menu entry.
 *
 * A real `<ul>`, so the nesting is structure a screen reader can announce
 * rather than an indent. Hidden entirely when collapsed — an indented tree in
 * an icon-width rail is unreadable, and the parent entry is still reachable.
 */
export const SidebarMenuSub = component<StyledProps>((props) => {
	return html`<ul
		data-slot="sidebar-menu-sub"
		class="${() =>
			cn(
				"border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
				sidebarCollapsed() ? "hidden" : "",
				read(props.class),
			)}"
	>${slot(props.children)}</ul>`;
});

/** One row of a nested list. Wrap a `SidebarMenuItem` in it. */
export const SidebarMenuSubItem = styledDiv(
	"sidebar-menu-sub-item",
	"relative flex min-w-0 items-center",
);
