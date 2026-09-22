/**
 * Sidebar — the application shell's navigation column.
 *
 *   SidebarProvider({ children: () => html`
 *     ${Sidebar({ children: () => SidebarContent({ children:
 *       SidebarGroup({ children: SidebarMenu({ children:
 *         SidebarMenuItem({ children:
 *           SidebarMenuButton({ href: "/", tooltip: "Home", children: "Home" })
 *         })
 *       }) })
 *     }) })}
 *     ${SidebarInset({ children: page })}
 *   ` })
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
	createContext,
	html,
	inject,
	onMount,
	onUnmount,
	provide,
	type Signal,
	signal,
} from "@c9up/aurora";
import { Button } from "../atoms/Button.js";
import { Input } from "../atoms/Input.js";
import { Separator } from "../atoms/Separator.js";
import { Skeleton } from "../atoms/Skeleton.js";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { cva, type VariantProps } from "../lib/cva.js";
import { PanelLeftIcon } from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";
import { styledDiv } from "../lib/styled.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./Sheet.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip.js";

const COOKIE_NAME = "nebula:sidebar";
const COOKIE_MAX_AGE_DAYS = 365;
const MOBILE_BREAKPOINT = 768;

let sharedOpen: Signal<boolean> | undefined;

/**
 * The cookie-backed open state, shared by every sidebar on the page.
 *
 * A module singleton and not a per-provider signal: the shell renders once and
 * the trigger may sit in a header that is not inside the provider's subtree.
 */
export function sidebarState(defaultOpen = true): Signal<boolean> {
	sharedOpen ??= cookieState(COOKIE_NAME, defaultOpen, booleanCookie, {
		path: "/",
		maxAge: COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
		sameSite: "lax",
	});
	return sharedOpen;
}

export function sidebarCollapsed(): boolean {
	return !sidebarState()();
}

export interface SidebarApi {
	readonly open: () => boolean;
	readonly isMobile: () => boolean;
	readonly state: () => "expanded" | "collapsed";
	setOpen(next: boolean): void;
	toggleSidebar(): void;
}

const SidebarContext = createContext<SidebarApi>("SidebarProvider");

/**
 * The sidebar's state, from inside it.
 *
 * Call from a component setup, as upstream's hook is called from a render.
 */
export function useSidebar(): SidebarApi {
	return inject(SidebarContext);
}

export interface SidebarProviderProps {
	/** Starting state. Read from the cookie when there is one. */
	defaultOpen?: boolean;
	open?: Reactive<boolean>;
	onOpenChange?: (open: boolean) => void;
	class?: Reactive<string>;
	children?: Parts;
}

export const SidebarProvider = component<SidebarProviderProps>((props) => {
	const open = sidebarState(props.defaultOpen ?? true);
	const mobile = signal(false);

	function setOpen(next: boolean): void {
		open(next);
		props.onOpenChange?.(next);
	}

	function toggleSidebar(): void {
		setOpen(!open());
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== "b" && event.key !== "B") return;
		if (!event.metaKey && !event.ctrlKey) return;
		event.preventDefault();
		toggleSidebar();
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

	function current(): boolean {
		const controlled = read(props.open);
		return controlled === undefined ? open() : controlled;
	}

	provide<SidebarApi>(SidebarContext, {
		open: current,
		isMobile: () => mobile(),
		state: () => (current() ? "expanded" : "collapsed"),
		setOpen,
		toggleSidebar,
	});

	return html`<div
		data-slot="sidebar-wrapper"
		class="${() => cn("flex min-h-svh w-full", read(props.class))}"
	>${props.children?.()}</div>`;
});

export interface SidebarProps {
	children?: Parts;
	/** Which edge. Default `"left"`. */
	side?: "left" | "right";
	/** What collapsing does: shrink to icons, or disappear. Default `"icon"`. */
	collapsible?: "icon" | "offcanvas" | "none";
	/** Announced as the navigation landmark's name. */
	label?: string;
	class?: Reactive<string>;
}

export const Sidebar = component<SidebarProps>((props) => {
	const sidebar = useSidebar();
	const side = props.side ?? "left";
	const collapsible = props.collapsible ?? "icon";
	const body = props.children?.();

	return html`<div data-slot="sidebar-root">${() =>
		sidebar.isMobile()
			? Sheet({
					open: () => sidebar.open(),
					onOpenChange: (next) => sidebar.setOpen(next),
					children: () =>
						SheetContent({
							side,
							class: "bg-sidebar text-sidebar-foreground w-[18rem] p-0",
							children: () =>
								html`${SheetHeader({
									class: "p-0",
									// A VALUE: `SheetHeader` takes a `Slot`, and a part that
									// reads context must be built while the context is still
									// on the stack.
									children: SheetTitle({
										children: props.label ?? "Navigation",
										srOnly: true,
									}),
								})}${body}`,
						}),
				})
			: html`<nav
					data-slot="sidebar"
					data-state="${() => sidebar.state()}"
					data-side="${side}"
					data-collapsible="${collapsible}"
					aria-label="${props.label ?? "Sidebar"}"
					class="${() =>
						cn(
							"group bg-sidebar text-sidebar-foreground h-svh shrink-0 overflow-hidden transition-[width] duration-200 ease-linear motion-reduce:transition-none",
							side === "left" ? "border-r" : "border-l",
							sidebar.open()
								? "w-(--sidebar-width,16rem)"
								: collapsible === "icon"
									? "w-(--sidebar-width-icon,3rem)"
									: collapsible === "none"
										? "w-(--sidebar-width,16rem)"
										: "w-0 border-0",
							read(props.class),
						)}"
				><div
						data-slot="sidebar-inner"
						class="flex h-full w-full flex-col"
					>${body}</div></nav>`}</div>`;
});

export interface SidebarTriggerProps {
	/** Overrides the provider's toggle — for a trigger outside the shell. */
	onToggle?: () => void;
	class?: Reactive<string>;
}

export const SidebarTrigger = component<SidebarTriggerProps>((props) =>
	Button({
		variant: "ghost",
		size: "icon",
		label: "Toggle sidebar",
		class: () => cn("size-7", read(props.class)),
		onClick: () => {
			if (props.onToggle !== undefined) {
				props.onToggle();
				return;
			}
			sidebarState()(!sidebarState()());
		},
		children: PanelLeftIcon({ class: "size-4" }),
	}),
);

export interface SidebarRailProps {
	class?: Reactive<string>;
}

/**
 * The hit area along the sidebar's edge that toggles it.
 *
 * A wider target than the trigger button and always where the eye already is.
 * `title` rather than a visible label, and it stays out of the tab order: the
 * keyboard has `cmd/ctrl + B` and the trigger, so a third stop on every page
 * would be noise.
 */
export const SidebarRail = component<SidebarRailProps>(
	(props) => html`<button
		type="button"
		data-slot="sidebar-rail"
		aria-label="Toggle sidebar"
		tabindex="-1"
		title="Toggle sidebar"
		class="${() =>
			cn(
				"hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
				read(props.class),
			)}"
		@click="${() => sidebarState()(!sidebarState()())}"
	></button>`,
);

export interface SidebarInsetProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** The page beside the sidebar. */
export const SidebarInset = component<SidebarInsetProps>(
	(props) => html`<main
		data-slot="sidebar-inset"
		class="${() =>
			cn(
				"bg-background relative flex w-full flex-1 flex-col",
				read(props.class),
			)}"
	>${slot(props.children)}</main>`,
);

export interface SidebarInputProps {
	placeholder?: string;
	value?: Reactive<string>;
	onInput?: (value: string) => void;
	class?: Reactive<string>;
}

/** A search field sized for the column. */
export const SidebarInput = component<SidebarInputProps>((props) =>
	Input({
		placeholder: props.placeholder,
		value: props.value,
		onInput: props.onInput,
		class: () => cn("bg-background h-8 w-full shadow-none", read(props.class)),
	}),
);

export const SidebarHeader = styledDiv(
	"sidebar-header",
	"flex flex-col gap-2 p-2",
);

export const SidebarFooter = styledDiv(
	"sidebar-footer",
	"flex flex-col gap-2 p-2",
);

export const SidebarContent = styledDiv(
	"sidebar-content",
	"flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
);

export interface SidebarSeparatorProps {
	class?: Reactive<string>;
}

export const SidebarSeparator = component<SidebarSeparatorProps>((props) =>
	Separator({
		class: () => cn("bg-sidebar-border mx-2 w-auto", read(props.class)),
	}),
);

export const SidebarGroup = styledDiv(
	"sidebar-group",
	"relative flex w-full min-w-0 flex-col p-2",
);

export const SidebarGroupLabel = styledDiv(
	"sidebar-group-label",
	"text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium transition-[margin,opacity] duration-200 ease-linear outline-hidden focus-visible:ring-2 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0",
);

export const SidebarGroupContent = styledDiv(
	"sidebar-group-content",
	"w-full text-sm",
);

export interface SidebarActionProps {
	children?: Slot;
	label?: string;
	onClick?: () => void;
	class?: Reactive<string>;
}

/** A control in a group's corner — "add", "filter". */
export const SidebarGroupAction = component<SidebarActionProps>(
	(props) => html`<button
		type="button"
		data-slot="sidebar-group-action"
		aria-label="${props.label}"
		class="${() =>
			cn(
				"text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 transition-transform outline-hidden focus-visible:ring-2 group-data-[collapsible=icon]:hidden [&>svg]:size-4 [&>svg]:shrink-0",
				read(props.class),
			)}"
		@click="${props.onClick}"
	>${slot(props.children)}</button>`,
);

export const SidebarMenu = component<{
	children?: Slot;
	class?: Reactive<string>;
}>(
	(props) => html`<ul
		data-slot="sidebar-menu"
		class="${() => cn("flex w-full min-w-0 flex-col gap-1", read(props.class))}"
	>${slot(props.children)}</ul>`,
);

/** One row. Holds a button, and optionally an action and a badge beside it. */
export const SidebarMenuItem = component<{
	children?: Slot;
	class?: Reactive<string>;
}>(
	(props) => html`<li
		data-slot="sidebar-menu-item"
		class="${() => cn("group/menu-item relative", read(props.class))}"
	>${slot(props.children)}</li>`,
);

export const sidebarMenuButtonVariants = cva(
	"peer/menu-button ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-has-data-[slot=sidebar-menu-action]/menu-item:pr-8 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:font-medium group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "",
				outline:
					"bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
			},
			size: {
				default: "h-8 text-sm",
				sm: "h-7 text-xs",
				lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

export type SidebarMenuButtonVariants = VariantProps<
	typeof sidebarMenuButtonVariants
>;

export interface SidebarMenuButtonProps extends SidebarMenuButtonVariants {
	children?: Slot;
	href?: string;
	active?: Reactive<boolean>;
	/**
	 * Shown as a tooltip while the sidebar is collapsed to icons.
	 *
	 * Only then: an entry whose label is already on screen does not need the
	 * same words repeated on hover. Without it a collapsed rail is a column of
	 * unlabelled glyphs, so give one to every entry that has an icon.
	 */
	tooltip?: string;
	onClick?: () => void;
	class?: Reactive<string>;
}

export const SidebarMenuButton = component<SidebarMenuButtonProps>((props) => {
	const merged = (): string =>
		cn(
			sidebarMenuButtonVariants({
				variant: props.variant,
				size: props.size,
			}),
			read(props.class),
		);

	const entry =
		props.href !== undefined
			? html`<a
					data-slot="sidebar-menu-button"
					href="${props.href}"
					data-active="${() => (read(props.active) === true ? "true" : undefined)}"
					aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
					class="${merged}"
				>${slot(props.children)}</a>`
			: html`<button
					type="button"
					data-slot="sidebar-menu-button"
					data-active="${() => (read(props.active) === true ? "true" : undefined)}"
					aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
					class="${merged}"
					@click="${props.onClick}"
				>${slot(props.children)}</button>`;

	if (props.tooltip === undefined) return entry;

	// Wrapped once, not toggled: swapping the wrapper on collapse would remount
	// the entry and lose focus mid-keyboard-navigation. The tooltip decides for
	// itself whether to open, which is the cheaper half to make conditional.
	return html`${() =>
		sidebarCollapsed()
			? Tooltip({
					children: () =>
						html`${TooltipTrigger({
							children: () => entry,
						})}${TooltipContent({ children: props.tooltip, side: "right" })}`,
				})
			: entry}`;
});

/** A second control on a row — a "more" menu, a remove button. */
export const SidebarMenuAction = component<SidebarActionProps>(
	(props) => html`<button
		type="button"
		data-slot="sidebar-menu-action"
		aria-label="${props.label}"
		class="${() =>
			cn(
				"text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 transition-transform outline-hidden focus-visible:ring-2 group-data-[collapsible=icon]:hidden [&>svg]:size-4 [&>svg]:shrink-0",
				read(props.class),
			)}"
		@click="${props.onClick}"
	>${slot(props.children)}</button>`,
);

/** A count or a status dot at the end of a row. */
export const SidebarMenuBadge = component<{
	children?: Slot;
	class?: Reactive<string>;
}>(
	(props) => html`<div
		data-slot="sidebar-menu-badge"
		class="${() =>
			cn(
				"text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none group-data-[collapsible=icon]:hidden",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

export interface SidebarMenuSkeletonProps {
	/** Leave room for an icon, as the real rows have. */
	showIcon?: boolean;
	class?: Reactive<string>;
}

/**
 * A placeholder row while the navigation loads.
 *
 * The widths vary per row, which is what stops a loading column from reading
 * as a bar chart. Seeded from a random draw the moment the row is built, so it
 * does not shift on every re-render.
 */
export const SidebarMenuSkeleton = component<SidebarMenuSkeletonProps>(
	(props) => {
		const width = `${Math.floor(Math.random() * 40) + 50}%`;
		return html`<div
			data-slot="sidebar-menu-skeleton"
			class="${() =>
				cn("flex h-8 items-center gap-2 rounded-md px-2", read(props.class))}"
		>${
			props.showIcon === true ? Skeleton({ class: "size-4 rounded-md" }) : null
		}<div class="flex-1" style="${`max-width: ${width}`}">${Skeleton({
			class: "h-4 w-full",
		})}</div></div>`;
	},
);

export const SidebarMenuSub = component<{
	children?: Slot;
	class?: Reactive<string>;
}>(
	(props) => html`<ul
		data-slot="sidebar-menu-sub"
		class="${() =>
			cn(
				"border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
				read(props.class),
			)}"
	>${slot(props.children)}</ul>`,
);

export const SidebarMenuSubItem = component<{
	children?: Slot;
	class?: Reactive<string>;
}>(
	(props) => html`<li
		data-slot="sidebar-menu-sub-item"
		class="${() => cn("group/menu-sub-item relative", read(props.class))}"
	>${slot(props.children)}</li>`,
);

export interface SidebarMenuSubButtonProps {
	children?: Slot;
	href?: string;
	active?: Reactive<boolean>;
	size?: "sm" | "md";
	onClick?: () => void;
	class?: Reactive<string>;
}

export const SidebarMenuSubButton = component<SidebarMenuSubButtonProps>(
	(props) => {
		const merged = (): string =>
			cn(
				"text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[collapsible=icon]:hidden [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
				props.size === "sm" ? "text-xs" : "text-sm",
				read(props.class),
			);
		if (props.href !== undefined) {
			return html`<a
				data-slot="sidebar-menu-sub-button"
				href="${props.href}"
				data-active="${() => (read(props.active) === true ? "true" : undefined)}"
				aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
				class="${merged}"
			>${slot(props.children)}</a>`;
		}
		return html`<button
			type="button"
			data-slot="sidebar-menu-sub-button"
			data-active="${() => (read(props.active) === true ? "true" : undefined)}"
			aria-current="${() => (read(props.active) === true ? "page" : undefined)}"
			class="${merged}"
			@click="${props.onClick}"
		>${slot(props.children)}</button>`;
	},
);
