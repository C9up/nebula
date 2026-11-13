/**
 * Sonner — toasts, the way shadcn ships them now.
 *
 * shadcn deprecated its own `toast` component in favour of `sonner`, a thin
 * wrapper over Emil Kowalski's library of the same name. This is that pair in
 * one file, ported to aurora without the library: a `Toaster` region mounted
 * once near the root, and a `toast` function callable from anywhere in the
 * browser — a route handler's error branch included — with no reference to
 * the region. On the server a toast is not kept: the region renders empty
 * there, and page code that raises one runs again in the browser.
 *
 *     Toaster({ richColors: true, closeButton: true })
 *
 *     toast('Event created', { description: 'Sunday, 9:00' })
 *     toast.error('Could not save', { action: { label: 'Retry', onClick: save } })
 *     toast.promise(save(form), {
 *       loading: 'Saving…',
 *       success: (saved) => `Saved ${saved.name}`,
 *       error: 'Could not save',
 *     })
 *
 * The API is sonner's, read from its published source: the same `toast`
 * methods, the same options, the same Toaster props, the same defaults (four
 * seconds on screen, three toasts visible, a 14px gap, 356px wide, `Alt+T` to
 * reach the region). The look is shadcn's: the surface takes the popover
 * colours, and the icons are the lucide set shadcn hands to sonner. The stack
 * is sonner's too — toasts pile up behind the newest one, scaled down, and fan
 * out while the pointer is over them, which also pauses their timers.
 *
 * NAMED DEVIATIONS, all deliberate:
 *
 * - **Announcements go through two hidden live regions**, mounted empty with
 *   the region: `polite` for every toast, `assertive` for an error. sonner
 *   makes its whole list one polite region, so an error waits its turn behind
 *   whatever is being read, and a list inserted with content in it is not
 *   announced by most screen readers at all.
 * - **The layout is computed, not styled.** sonner drives its stack from a
 *   stylesheet it injects, reading custom properties it sets per toast. Here
 *   the same rules produce an inline `transform`, `opacity` and `height`, so
 *   the stack works under every adapter — nothing depends on a stylesheet that
 *   might not be there, or on compound selectors an engine might not emit.
 * - **`class`, `descriptionClass`**, where React says `className`. Every
 *   nebula component spells it that way.
 * - **`toast.promise` returns `{ id, unwrap }`**, not the id with `unwrap`
 *   grafted on: a number or a string cannot carry a method without being
 *   boxed into something that is no longer equal to the id.
 * - **No swipe to dismiss, no `getHistory`, no focus hand-back on blur.**
 *   The close button, the timer and `Alt+T` remain; an app that needs a swipe
 *   gesture has the `data-*` attributes sonner's own CSS reads.
 * - `action` and `cancel` take `{ label, onClick }` only, not an arbitrary
 *   element; `toast.custom` is the way to render something of your own.
 */

import {
	component,
	each,
	effect,
	html,
	isEach,
	isTemplateResult,
	onMount,
	onUnmount,
	type ReadSignal,
	signal,
	uid,
	untrack,
} from "@c9up/aurora";
import type { Child, Slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import {
	CircleCheckIcon,
	InfoIcon,
	LoaderIcon,
	OctagonXIcon,
	TriangleAlertIcon,
	XIcon,
} from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";

// ─── Types ───────────────────────────────────────────────────────────

/** `undefined` is a plain `toast()`: no icon, no rich colour. */
export type ToastType =
	| "default"
	| "success"
	| "info"
	| "warning"
	| "error"
	| "loading";

export type Position =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "top-center"
	| "bottom-center";

/** A number when `toast` minted it, the caller's own when one was given. */
export type ToastId = number | string;

export interface Action {
	label: Child;
	onClick: (event: MouseEvent) => void;
}

/** Extra classes per part, merged after nebula's own. */
export interface ToastClassnames {
	toast?: string;
	title?: string;
	description?: string;
	loader?: string;
	closeButton?: string;
	cancelButton?: string;
	actionButton?: string;
	success?: string;
	error?: string;
	info?: string;
	warning?: string;
	loading?: string;
	default?: string;
	content?: string;
	icon?: string;
}

/** Replaces shadcn's icons. `null` for a type shows none. */
export interface ToastIcons {
	success?: Child;
	info?: Child;
	warning?: Child;
	error?: Child;
	loading?: Child;
	close?: Child;
}

/** What every `toast` call takes after its message. */
export interface ExternalToast {
	/**
	 * A stable id. A toast raised under an id already on screen UPDATES it —
	 * which is how a loading toast becomes its outcome, and how "you are
	 * offline", raised on every failed request, stays one toast.
	 */
	id?: ToastId;
	/** Shown only by the `Toaster` whose `id` is this. */
	toasterId?: string;
	description?: Slot;
	/** Replaces the type's icon; `null` shows none. */
	icon?: Child;
	richColors?: boolean;
	invert?: boolean;
	closeButton?: boolean;
	/** `false` keeps the close button and the timer from removing it. */
	dismissible?: boolean;
	/** Milliseconds on screen. `Infinity` keeps it until dismissed. */
	duration?: number;
	action?: Action;
	cancel?: Action;
	/** Called when it is dismissed: the close button, `cancel`, `toast.dismiss`. */
	onDismiss?: (toast: ToastT) => void;
	/** Called when its time runs out. */
	onAutoClose?: (toast: ToastT) => void;
	class?: string;
	descriptionClass?: string;
	classNames?: ToastClassnames;
	/** Drops nebula's look, keeping only the layout. */
	unstyled?: boolean;
	/** A corner of its own, other than the Toaster's. */
	position?: Position;
	testId?: string;
}

/** A toast as the region holds it. */
export interface ToastT extends ExternalToast {
	readonly id: ToastId;
	title?: Slot;
	type?: ToastType;
	/** What `toast.custom` rendered, in place of the title and the styling. */
	custom?: Child;
	/** Raised by `toast.promise`. */
	promise?: boolean;
}

/** A stage of `toast.promise` that says more than its message. */
export interface PromiseExtendedResult extends ExternalToast {
	message: Child;
}

type StageValue = Child | PromiseExtendedResult;

/** A stage of `toast.promise`: its message, or a function of the outcome. */
export type PromiseResult<Value> =
	| StageValue
	| ((value: Value) => StageValue | Promise<StageValue>);

export interface PromiseData<Value> extends Omit<ExternalToast, "description"> {
	loading?: Child;
	success?: PromiseResult<Value>;
	error?: PromiseResult<unknown>;
	description?: Child | ((value: unknown) => Child | Promise<Child>);
	finally?: () => void | Promise<void>;
}

// ─── State ───────────────────────────────────────────────────────────

/** sonner's defaults, as its source declares them. */
const VISIBLE_TOASTS_AMOUNT = 3;
const VIEWPORT_OFFSET = "24px";
const MOBILE_VIEWPORT_OFFSET = "16px";
const TOAST_LIFETIME = 4000;
const TOAST_WIDTH = 356;
const GAP = 14;
const TIME_BEFORE_UNMOUNT = 200;
/** How long an announcement stays in its live region once read. */
const ANNOUNCEMENT_LIFETIME = 7000;

interface ToastRecord extends ToastT {
	/** One per toast raised, so a new toast under a reused id is a new row. */
	readonly serial: number;
	/** Dismissed: playing its exit before it leaves the list. */
	readonly removing: boolean;
}

type ToastInput = Omit<ToastT, "id"> & { id?: ToastId };

/** Newest first, as sonner stacks them. */
const records = signal<readonly ToastRecord[]>([]);
let counter = 1;
let serials = 0;

function idFor(data: { id?: ToastId }): ToastId {
	if (typeof data.id === "number") return data.id;
	if (typeof data.id === "string" && data.id.length > 0) return data.id;
	const id = counter;
	counter += 1;
	return id;
}

/**
 * No document: this is the server, rendering a page for one request in a
 * process that renders everyone's. A toast kept here would reach the next
 * user's markup and never leave, its timer belonging to a mounted row.
 */
function onServer(): boolean {
	return typeof document === "undefined";
}

function create(data: ToastInput): ToastId {
	const id = idFor(data);
	// The page code that raised it runs again in the browser, where it is kept.
	if (onServer()) return id;
	const list = records();
	const existing = list.find((entry) => entry.id === id && !entry.removing);
	if (existing !== undefined) {
		records(
			list.map((entry) =>
				entry === existing ? { ...entry, ...data, id } : entry,
			),
		);
		return id;
	}
	// One still leaving under the same id is gone: this is a new toast, not
	// a merge, or its old `action` would leak into the new one.
	serials += 1;
	const fresh: ToastRecord = { ...data, id, serial: serials, removing: false };
	records([fresh, ...list.filter((entry) => entry.id !== id)]);
	return id;
}

/**
 * Run an application callback without letting it take the caller down: they
 * run from a timer, a click and `dismiss()` alike, and one that throws would
 * leave the list half-updated.
 */
function notify(
	callback: ((toast: ToastT) => void) | undefined,
	toast: ToastT,
): void {
	if (callback === undefined) return;
	try {
		callback(toast);
	} catch (error) {
		console.error("[nebula] a toast callback threw", error);
	}
}

/**
 * Start a toast's exit, and drop it once the exit has played.
 *
 * The drop is scheduled here, not by the region, so a toast dismissed while
 * no `Toaster` is mounted still leaves.
 */
function remove(id: ToastId, reason: "dismiss" | "autoClose" | "silent"): void {
	const target = records().find((entry) => entry.id === id && !entry.removing);
	if (target === undefined) return;
	records(
		records().map((entry) =>
			entry === target ? { ...entry, removing: true } : entry,
		),
	);
	if (reason === "dismiss") notify(target.onDismiss, target);
	if (reason === "autoClose") notify(target.onAutoClose, target);
	setTimeout(() => {
		records(records().filter((entry) => entry.serial !== target.serial));
	}, TIME_BEFORE_UNMOUNT);
}

function dismiss(id?: ToastId): ToastId | undefined {
	if (id === undefined) {
		for (const entry of records()) {
			if (!entry.removing) remove(entry.id, "dismiss");
		}
		return id;
	}
	remove(id, "dismiss");
	return id;
}

function isNodeLike(value: object): boolean {
	return typeof Node !== "undefined" && value instanceof Node;
}

/** A stage that carries options, rather than a message to show. */
function isExtendedResult(value: unknown): value is PromiseExtendedResult {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		!isTemplateResult(value) &&
		!isNodeLike(value) &&
		"message" in value
	);
}

function isHttpResponse(
	value: unknown,
): value is { ok: boolean; status: number } {
	return (
		typeof value === "object" &&
		value !== null &&
		"ok" in value &&
		typeof value.ok === "boolean" &&
		"status" in value &&
		typeof value.status === "number"
	);
}

async function stageValue<Value>(
	stage: PromiseResult<Value>,
	value: Value,
): Promise<PromiseExtendedResult> {
	const result =
		typeof stage === "function" && !isEach(stage) ? await stage(value) : stage;
	return isExtendedResult(result) ? result : { message: result };
}

function promise<Value>(
	work: Promise<Value> | (() => Promise<Value>),
	data?: PromiseData<Value>,
): { id: ToastId | undefined; unwrap: () => Promise<Value> } {
	const run = Promise.resolve(typeof work === "function" ? work() : work);
	if (data === undefined) return { id: undefined, unwrap: () => run };

	const {
		loading,
		success,
		error,
		description,
		finally: onFinally,
		...options
	} = data;
	let id: ToastId | undefined;
	if (loading !== undefined) {
		id = create({
			...options,
			promise: true,
			type: "loading",
			title: loading,
			description:
				typeof description === "function" && !isEach(description)
					? undefined
					: description,
		});
	}

	async function settle<Stage>(
		type: "success" | "error",
		stage: PromiseResult<Stage>,
		value: Stage,
	): Promise<void> {
		const { message, ...settings } = await stageValue(stage, value);
		const text =
			typeof description === "function" && !isEach(description)
				? await description(value)
				: description;
		create({
			...options,
			id,
			type,
			description: text,
			...settings,
			title: message,
		});
	}

	// The loading toast stays only while nothing has replaced it.
	let shouldDismiss = id !== undefined;
	let outcome:
		| { ok: true; value: Value }
		| { ok: false; reason: unknown }
		| undefined;
	const done = run
		.then(async (response) => {
			outcome = { ok: true, value: response };
			if (isHttpResponse(response) && !response.ok) {
				shouldDismiss = false;
				if (error !== undefined) {
					await settle(
						"error",
						error,
						`HTTP error! status: ${response.status}`,
					);
				}
			} else if (response instanceof Error) {
				shouldDismiss = false;
				if (error !== undefined) await settle("error", error, response);
			} else if (success !== undefined) {
				shouldDismiss = false;
				await settle("success", success, response);
			}
		})
		.catch(async (reason: unknown) => {
			outcome = { ok: false, reason };
			if (error !== undefined) {
				shouldDismiss = false;
				await settle("error", error, reason);
			}
		})
		.finally(() => {
			if (shouldDismiss && id !== undefined) dismiss(id);
			return onFinally?.();
		});

	return {
		id,
		unwrap: () =>
			done.then(() => {
				if (outcome?.ok === true) return outcome.value;
				return Promise.reject(
					outcome?.ok === false ? outcome.reason : undefined,
				);
			}),
	};
}

function typed(type: ToastType | undefined) {
	return (message: Slot, data?: ExternalToast): ToastId =>
		create({ ...data, title: message, type });
}

/**
 * Raise a toast. Returns its id, which `toast.dismiss` takes.
 *
 * Callable from anywhere — no component, no context, no handle.
 */
export const toast = Object.assign(typed(undefined), {
	/** A plain toast; on an existing id, resets its type. */
	message: typed(undefined),
	success: typed("success"),
	info: typed("info"),
	warning: typed("warning"),
	error: typed("error"),
	/** Stays until it is updated or dismissed. */
	loading: typed("loading"),
	/** Render your own content, unstyled; `render` gets the toast's id. */
	custom(render: (id: ToastId) => Child, data?: ExternalToast): ToastId {
		const id = idFor(data ?? {});
		return create({ ...data, id, custom: render(id), type: undefined });
	},
	/**
	 * One toast for the whole life of an async call: loading, then its outcome.
	 *
	 * A rejection is reported, not swallowed: `unwrap()` hands it back to the
	 * caller's own error path.
	 */
	promise,
	/** Dismiss one toast, or every toast when no id is given. */
	dismiss,
	/** The toasts on screen, newest first. */
	getToasts(): ToastT[] {
		return records().filter((entry) => !entry.removing);
	},
});

// ─── Toaster ─────────────────────────────────────────────────────────

export type Offset =
	| {
			top?: string | number;
			right?: string | number;
			bottom?: string | number;
			left?: string | number;
	  }
	| string
	| number;

/** Defaults for every toast this region shows. */
export interface ToastOptions {
	class?: string;
	closeButton?: boolean;
	descriptionClass?: string;
	duration?: number;
	unstyled?: boolean;
	classNames?: ToastClassnames;
	/** The close cross's accessible name. Default `"Close toast"`. */
	closeButtonAriaLabel?: string;
}

export interface ToasterProps {
	/** Shows only the toasts raised with this `toasterId`. */
	id?: string;
	invert?: boolean;
	/**
	 * `"system"` follows the app's `dark` variant, which is what shadcn hands
	 * sonner from `next-themes`. Default `"system"`.
	 */
	theme?: "light" | "dark" | "system";
	/** Default `"bottom-right"`. */
	position?: Position;
	/** `KeyboardEvent` keys and codes that reach the region. Default Alt+T. */
	hotkey?: string[];
	richColors?: boolean;
	/** Keep the stack fanned out instead of piled up. */
	expand?: boolean;
	/** Milliseconds on screen. Default 4000. */
	duration?: number;
	/** Space between fanned-out toasts. Default 14. */
	gap?: number;
	/** How many show at once. Default 3. */
	visibleToasts?: number;
	closeButton?: boolean;
	toastOptions?: ToastOptions;
	class?: Reactive<string>;
	/** From the viewport's edges. Default `24px`. */
	offset?: Offset;
	/** The same, at 600px wide and under. Default `16px`. */
	mobileOffset?: Offset;
	dir?: "rtl" | "ltr" | "auto";
	icons?: ToastIcons;
	/** Replaces the region's whole accessible name. */
	customAriaLabel?: string;
	/** The region's name, before the hotkey. Default `"Notifications"`. */
	containerAriaLabel?: string;
}

type Sides = Readonly<Record<"top" | "right" | "bottom" | "left", string>>;

function sidesOf(offset: Offset | undefined, fallback: string): Sides {
	const unit = (value: string | number): string =>
		typeof value === "number" ? `${value}px` : value;
	if (typeof offset === "number" || typeof offset === "string") {
		const all = unit(offset);
		return { top: all, right: all, bottom: all, left: all };
	}
	return {
		top: offset?.top === undefined ? fallback : unit(offset.top),
		right: offset?.right === undefined ? fallback : unit(offset.right),
		bottom: offset?.bottom === undefined ? fallback : unit(offset.bottom),
		left: offset?.left === undefined ? fallback : unit(offset.left),
	};
}

function axesOf(position: Position): {
	y: "top" | "bottom";
	x: "left" | "right" | "center";
} {
	const [y, x] = position.split("-");
	return {
		y: y === "top" ? "top" : "bottom",
		x: x === "left" ? "left" : x === "right" ? "right" : "center",
	};
}

type ThemeMode = "light" | "dark" | "system";

/**
 * Colour classes per theme, written out in full: Tailwind finds a class only
 * where it appears whole in the source, so `dark:` cannot be prefixed at
 * runtime. `system` defers to the app's `dark` variant.
 */
interface Themed {
	readonly light: string;
	readonly dark: string;
	readonly system: string;
}

/** sonner's rich colours, per type and theme. */
const RICH: Readonly<Record<"success" | "info" | "warning" | "error", Themed>> =
	{
		success: {
			light:
				"bg-[hsl(143,85%,96%)] border-[hsl(145,92%,87%)] text-[hsl(140,100%,27%)]",
			dark: "bg-[hsl(150,100%,6%)] border-[hsl(147,100%,12%)] text-[hsl(150,86%,65%)]",
			system:
				"bg-[hsl(143,85%,96%)] border-[hsl(145,92%,87%)] text-[hsl(140,100%,27%)] dark:bg-[hsl(150,100%,6%)] dark:border-[hsl(147,100%,12%)] dark:text-[hsl(150,86%,65%)]",
		},
		info: {
			light:
				"bg-[hsl(208,100%,97%)] border-[hsl(221,91%,93%)] text-[hsl(210,92%,45%)]",
			dark: "bg-[hsl(215,100%,6%)] border-[hsl(223,43%,17%)] text-[hsl(216,87%,65%)]",
			system:
				"bg-[hsl(208,100%,97%)] border-[hsl(221,91%,93%)] text-[hsl(210,92%,45%)] dark:bg-[hsl(215,100%,6%)] dark:border-[hsl(223,43%,17%)] dark:text-[hsl(216,87%,65%)]",
		},
		warning: {
			light:
				"bg-[hsl(49,100%,97%)] border-[hsl(49,91%,84%)] text-[hsl(31,92%,45%)]",
			dark: "bg-[hsl(64,100%,6%)] border-[hsl(60,100%,9%)] text-[hsl(46,87%,65%)]",
			system:
				"bg-[hsl(49,100%,97%)] border-[hsl(49,91%,84%)] text-[hsl(31,92%,45%)] dark:bg-[hsl(64,100%,6%)] dark:border-[hsl(60,100%,9%)] dark:text-[hsl(46,87%,65%)]",
		},
		error: {
			light:
				"bg-[hsl(359,100%,97%)] border-[hsl(359,100%,94%)] text-[hsl(360,100%,45%)]",
			dark: "bg-[hsl(358,76%,10%)] border-[hsl(357,89%,16%)] text-[hsl(358,100%,81%)]",
			system:
				"bg-[hsl(359,100%,97%)] border-[hsl(359,100%,94%)] text-[hsl(360,100%,45%)] dark:bg-[hsl(358,76%,10%)] dark:border-[hsl(357,89%,16%)] dark:text-[hsl(358,100%,81%)]",
		},
	};

/** shadcn's surface: the popover colours. */
const NORMAL = "bg-popover text-popover-foreground border-border";

/** sonner's `invert`: the opposite of the theme. */
const INVERT: Themed = {
	light: "bg-black border-[hsl(0,0%,20%)] text-[hsl(0,0%,99%)]",
	dark: "bg-white border-[hsl(0,0%,95.1%)] text-[hsl(0,0%,9%)]",
	system:
		"bg-black border-[hsl(0,0%,20%)] text-[hsl(0,0%,99%)] dark:bg-white dark:border-[hsl(0,0%,95.1%)] dark:text-[hsl(0,0%,9%)]",
};

const DESCRIPTION: Themed = {
	light: "text-[#3f3f3f]",
	dark: "text-[#e8e8e8]",
	system: "text-[#3f3f3f] dark:text-[#e8e8e8]",
};

const CANCEL: Themed = {
	light: "bg-black/8",
	dark: "bg-white/30",
	system: "bg-black/8 dark:bg-white/30",
};

const CLOSE_HOVER: Themed = {
	light: "hover:bg-[hsl(0,0%,97.3%)] hover:border-[hsl(0,0%,90.9%)]",
	dark: "hover:bg-[hsl(0,0%,12%)] hover:border-[hsl(0,0%,25%)]",
	system:
		"hover:bg-[hsl(0,0%,97.3%)] hover:border-[hsl(0,0%,90.9%)] dark:hover:bg-[hsl(0,0%,12%)] dark:hover:border-[hsl(0,0%,25%)]",
};

const TOAST_LAYOUT =
	"absolute box-border outline-none touch-none [overflow-wrap:anywhere] transition-[transform,opacity,height,box-shadow] duration-400 motion-reduce:transition-none";

/** sonner's styled toast, with shadcn's colours in place of its own. */
const TOAST_STYLED =
	"flex items-center gap-1.5 rounded-lg border p-4 text-[13px] shadow-[0_4px_12px_rgba(0,0,0,0.1)] focus-visible:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_0_2px_rgba(0,0,0,0.2)] [&>*]:transition-opacity [&>*]:duration-400 data-[expanded=false]:data-[front=false]:[&>*]:opacity-0";

const BUTTON =
	"ms-auto me-0 flex h-6 shrink-0 cursor-pointer items-center rounded-[4px] border-none px-2 text-xs font-medium outline-none transition-opacity focus-visible:shadow-[0_0_0_2px_rgba(0,0,0,0.4)]";

const CLOSE_BUTTON =
	"absolute start-0 top-0 z-1 flex size-5 cursor-pointer items-center justify-center rounded-full border p-0 -translate-x-[35%] -translate-y-[35%] rtl:translate-x-[35%] transition-[opacity,background-color,border-color] focus-visible:shadow-[0_4px_12px_rgba(0,0,0,0.1),0_0_0_2px_rgba(0,0,0,0.2)]";

/** The icons shadcn hands to sonner. */
function defaultIcon(type: ToastType | undefined): Child {
	switch (type) {
		case "success":
			return CircleCheckIcon({ class: "size-4" });
		case "info":
			return InfoIcon({ class: "size-4" });
		case "warning":
			return TriangleAlertIcon({ class: "size-4" });
		case "error":
			return OctagonXIcon({ class: "size-4" });
		case "loading":
			return LoaderIcon({ class: "size-4 animate-spin" });
		default:
			return null;
	}
}

/** What one region shares with its rows. */
interface ToasterState {
	readonly expanded: () => boolean;
	/** Hovered, pressed, or the tab is hidden: timers hold. */
	readonly paused: () => boolean;
	readonly expandByDefault: boolean;
	readonly gap: number;
	readonly visibleToasts: number;
	readonly duration: number | undefined;
	readonly closeButton: boolean | undefined;
	readonly richColors: boolean;
	readonly invert: boolean;
	readonly theme: ThemeMode;
	readonly icons: ToastIcons | undefined;
	readonly options: ToastOptions;
	readonly narrow: () => boolean;
	readonly mobile: Sides;
	/** Measured heights, by row. */
	readonly heights: () => ReadonlyMap<number, number>;
	setHeight(serial: number, height: number | undefined): void;
	announce(text: string, assertive: boolean): void;
}

interface Announcement {
	readonly key: number;
	readonly text: string;
}

/**
 * Mount once, near the root of the app.
 *
 * `data-nebula-live` exempts it from the `aria-hidden` sweep a modal performs
 * over its siblings: a toast raised while a dialog is open is still announced.
 */
export const Toaster = component<ToasterProps>((props) => {
	const position = props.position ?? "bottom-right";
	const hotkey = props.hotkey ?? ["altKey", "KeyT"];
	const hotkeyLabel = hotkey
		.join("+")
		.replace(/Key/g, "")
		.replace(/Digit/g, "");
	const label =
		props.customAriaLabel ??
		`${props.containerAriaLabel ?? "Notifications"} ${hotkeyLabel}`;
	const offset = sidesOf(props.offset, VIEWPORT_OFFSET);
	const mobile = sidesOf(props.mobileOffset, MOBILE_VIEWPORT_OFFSET);
	const gap = props.gap ?? GAP;
	const sectionId = uid("sonner");

	const expanded = signal(false);
	const interacting = signal(false);
	const hidden = signal(false);
	const narrow = signal(false);
	const prefersDark = signal(false);
	const heights = signal<ReadonlyMap<number, number>>(new Map());
	const polite = signal<readonly Announcement[]>([]);
	const assertive = signal<readonly Announcement[]>([]);
	let announcements = 0;

	/**
	 * Off until mounted, as sonner's list is state filled from an effect: the
	 * server's markup carries no toast, and adopting it renders none either,
	 * so the rows appear once the region is live.
	 */
	const adopted = signal(false);

	/** The toasts this region shows: its own `toasterId`, or none. */
	const mine = (): readonly ToastRecord[] =>
		(adopted() ? records() : []).filter((entry) =>
			props.id === undefined
				? entry.toasterId === undefined
				: entry.toasterId === props.id,
		);

	/** One list per corner in use, the region's own first. */
	const positions = (): Position[] => [
		...new Set<Position>([
			position,
			...mine().flatMap((entry) =>
				entry.position === undefined ? [] : [entry.position],
			),
		]),
	];

	const state: ToasterState = {
		expanded,
		paused: () => expanded() || interacting() || hidden(),
		expandByDefault: props.expand ?? false,
		gap,
		visibleToasts: props.visibleToasts ?? VISIBLE_TOASTS_AMOUNT,
		duration: props.toastOptions?.duration ?? props.duration,
		closeButton: props.toastOptions?.closeButton ?? props.closeButton,
		richColors: props.richColors ?? false,
		invert: props.invert ?? false,
		theme: props.theme ?? "system",
		icons: props.icons,
		options: props.toastOptions ?? {},
		narrow,
		mobile,
		heights,
		setHeight(serial, height) {
			// Untracked: a row measures from its mount hook and from effects, and
			// reading what it writes would make whichever runs it depend on it.
			const current = untrack(() => heights());
			if (current.get(serial) === height) return;
			const next = new Map(current);
			if (height === undefined) next.delete(serial);
			else next.set(serial, height);
			heights(next);
		},
		announce(text, isAssertive) {
			if (text.trim() === "") return;
			const region = isAssertive ? assertive : polite;
			announcements += 1;
			const entry: Announcement = { key: announcements, text };
			region([...region(), entry]);
			setTimeout(() => {
				region(region().filter((candidate) => candidate !== entry));
			}, ANNOUNCEMENT_LIFETIME);
		},
	};

	onMount(() => {
		adopted(true);
		// A stack of one has nothing to fan out.
		const stopCollapse = effect(() => {
			if (mine().length <= 1) expanded(false);
		});

		const onKeyDown = (event: KeyboardEvent): void => {
			const pressed =
				hotkey.length > 0 &&
				hotkey.every(
					(key) => Reflect.get(event, key) === true || event.code === key,
				);
			const section = document.getElementById(sectionId);
			if (pressed) {
				expanded(true);
				section?.querySelector<HTMLElement>("[data-sonner-toaster]")?.focus();
			}
			if (
				event.code === "Escape" &&
				section !== null &&
				section.contains(document.activeElement)
			) {
				expanded(false);
			}
		};
		const onVisibility = (): void => {
			hidden(document.hidden);
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("visibilitychange", onVisibility);
		onVisibility();

		const queries =
			typeof window.matchMedia === "function"
				? {
						narrow: window.matchMedia("(max-width: 600px)"),
						dark: window.matchMedia("(prefers-color-scheme: dark)"),
					}
				: undefined;
		const onNarrow = (): void => {
			narrow(queries?.narrow.matches ?? false);
		};
		const onDark = (): void => {
			prefersDark(queries?.dark.matches ?? false);
		};
		queries?.narrow.addEventListener("change", onNarrow);
		queries?.dark.addEventListener("change", onDark);
		onNarrow();
		onDark();

		return () => {
			stopCollapse();
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("visibilitychange", onVisibility);
			queries?.narrow.removeEventListener("change", onNarrow);
			queries?.dark.removeEventListener("change", onDark);
		};
	});

	const resolvedTheme = (): "light" | "dark" =>
		state.theme === "system" ? (prefersDark() ? "dark" : "light") : state.theme;

	/**
	 * The list's placement, bound as a `.style` property: the CSSOM is not
	 * subject to a Content-Security-Policy, where a `style` attribute is blocked
	 * by any policy without `'unsafe-inline'` — and the list then fell into the
	 * page flow. The server writes no property, so the list also carries `fixed`
	 * as a class: before hydration it is empty, and still out of the flow.
	 */
	function listStyle(corner: Position): string {
		const { x, y } = axesOf(corner);
		const rules = [
			"position:fixed",
			"z-index:999999999",
			`width:${narrow() ? "100%" : `${TOAST_WIDTH}px`}`,
		];
		if (narrow()) {
			rules.push(
				`${y}:${mobile[y]}`,
				`left:${mobile.left}`,
				`right:${mobile.right}`,
			);
		} else {
			rules.push(`${y}:${offset[y]}`);
			if (x === "center") rules.push("left:50%", "transform:translateX(-50%)");
			else rules.push(`${x}:${offset[x]}`);
		}
		return rules.join(";");
	}

	function renderList(
		corner: ReadSignal<Position>,
		index: ReadSignal<number>,
	): Child {
		const toasts = (): readonly ToastRecord[] =>
			mine().filter((entry) =>
				entry.position === undefined
					? index() === 0
					: entry.position === corner(),
			);
		return html`<ol
			data-sonner-toaster
			data-sonner-theme="${resolvedTheme}"
			data-y-position="${() => axesOf(corner()).y}"
			data-x-position="${() => axesOf(corner()).x}"
			dir="${props.dir === "auto" ? undefined : props.dir}"
			tabindex="-1"
			class="${() => cn("fixed z-[999999999] m-0 box-border list-none p-0 outline-none", read(props.class))}"
			.style="${() => listStyle(corner())}"
			@pointerenter="${() => expanded(true)}"
			@pointermove="${() => expanded(true)}"
			@pointerleave="${() => {
				if (!interacting()) expanded(false);
			}}"
			@pointerdown="${(event: PointerEvent) => {
				const target = event.target;
				if (
					target instanceof HTMLElement &&
					target.dataset.dismissible === "false"
				)
					return;
				interacting(true);
			}}"
			@pointerup="${() => interacting(false)}"
		>${each(
			toasts,
			(entry) => entry.serial,
			(entry, at) =>
				ToastRow({ entry, index: at, toasts, corner: corner(), state }),
		)}</ol>`;
	}

	return html`<section
		id="${sectionId}"
		data-slot="sonner"
		data-nebula-live
		aria-label="${label}"
		tabindex="-1"
	>
		<div role="status" aria-live="polite" aria-atomic="false" class="sr-only">${each(
			polite,
			(entry) => entry.key,
			(entry) => html`<p>${() => entry().text}</p>`,
		)}</div>
		<div role="alert" aria-live="assertive" aria-atomic="false" class="sr-only">${each(
			assertive,
			(entry) => entry.key,
			(entry) => html`<p>${() => entry().text}</p>`,
		)}</div>
		${each(positions, (corner) => corner, renderList)}
	</section>`;
});

interface ToastRowProps {
	entry: ReadSignal<ToastRecord>;
	index: ReadSignal<number>;
	/** The rows of the same list, newest first. */
	toasts: () => readonly ToastRecord[];
	corner: Position;
	state: ToasterState;
}

/**
 * One toast. A component so it has a lifetime: it measures itself once it is
 * in the document, owns its timer, and announces what it says.
 */
const ToastRow = component<ToastRowProps>((props) => {
	const { state } = props;
	const rowId = uid("sonner-toast");
	const mounted = signal(false);
	const initialHeight = signal(0);
	/** Where it stood when it was dismissed, so its exit starts from there. */
	let offsetBeforeRemove = 0;

	const { x, y } = axesOf(props.corner);
	const lift = y === "top" ? 1 : -1;
	const record = props.entry;
	const isFront = (): boolean => props.index() === 0;
	const isVisible = (): boolean => props.index() + 1 <= state.visibleToasts;
	const isExpanded = (): boolean =>
		state.expanded() || (state.expandByDefault && mounted());
	const styled = (): boolean =>
		!(
			record().custom !== undefined ||
			record().unstyled === true ||
			state.options.unstyled === true
		);
	const rich = (): boolean => record().richColors ?? state.richColors;
	const inverted = (): boolean => record().invert === true || state.invert;
	const dismissible = (): boolean => record().dismissible !== false;
	const duration = (): number =>
		record().duration || state.duration || TOAST_LIFETIME;

	/** Measured heights of the rows in front of this one, sonner's `offset`. */
	const offset = (): number => {
		const measured = state.heights();
		const ordered = props.toasts().flatMap((entry) => {
			const height = measured.get(entry.serial);
			return height === undefined ? [] : [{ serial: entry.serial, height }];
		});
		const heightIndex = ordered.findIndex(
			(entry) => entry.serial === record().serial,
		);
		if (heightIndex === -1) return offsetBeforeRemove;
		let before = 0;
		for (const entry of ordered.slice(0, heightIndex)) before += entry.height;
		return heightIndex * state.gap + before;
	};

	const frontHeight = (): number => {
		const front = props.toasts()[0];
		return front === undefined ? 0 : (state.heights().get(front.serial) ?? 0);
	};

	function style(): string {
		const rules = [
			`${y}:0`,
			`z-index:${props.toasts().length - props.index()}`,
		];
		if (state.narrow()) {
			rules.push(
				"left:0",
				"right:0",
				`width:calc(100% - ${state.mobile.left} * 2)`,
			);
		} else {
			if (x !== "center") rules.push(`${x}:0`);
			rules.push(`width:${TOAST_WIDTH}px`);
		}

		let transform: string;
		let opacity = 1;
		let height: string | undefined;
		if (record().removing) {
			opacity = 0;
			if (isFront()) transform = `translateY(${lift * -100}%)`;
			else if (isExpanded())
				transform = `translateY(calc(${lift * offsetBeforeRemove}px + ${lift * -100}%))`;
			else {
				transform = "translateY(40%)";
				rules.push("transition:transform .5s,opacity .2s");
			}
		} else if (!mounted()) {
			opacity = 0;
			transform = `translateY(${lift * -100}%)`;
		} else if (isExpanded()) {
			transform = `translateY(${lift * offset()}px)`;
			height = state.expandByDefault ? "auto" : `${initialHeight()}px`;
		} else if (isFront()) {
			transform = "translateY(0)";
		} else {
			const before = props.index();
			transform = `translateY(${lift * state.gap * before}px) scale(${1 - before * 0.05})`;
			height = `${frontHeight()}px`;
		}
		if (!isVisible()) {
			opacity = 0;
			rules.push("pointer-events:none");
		}
		rules.push(`transform:${transform}`, `opacity:${opacity}`);
		if (height !== undefined) rules.push(`height:${height}`);
		return rules.join(";");
	}

	function element(): HTMLElement | null {
		return document.getElementById(rowId);
	}

	/** The height the content asks for, whatever the stack has set. */
	function measure(): void {
		const node = element();
		if (node === null) return;
		const original = node.style.height;
		node.style.height = "auto";
		const height = node.getBoundingClientRect().height;
		node.style.height = original;
		initialHeight(height);
		state.setHeight(record().serial, height);
	}

	/** What a screen reader is told: the title and the description, as text. */
	function spoken(): string {
		const node = element();
		if (node === null) return "";
		const parts = [
			node.querySelector("[data-title]")?.textContent ?? "",
			node.querySelector("[data-description]")?.textContent ?? "",
		];
		return parts
			.map((part) => part.trim())
			.filter((part) => part !== "")
			.join(". ");
	}

	onMount(() => {
		untrack(() => {
			measure();
			// Read after the first layout, so the entrance transitions from where
			// the toast was first painted rather than appearing in place.
			mounted(true);
		});

		let lastSpoken = "";
		let lastType: ToastType | undefined;
		const stopContent = effect(() => {
			const current = record();
			// Tracked so an update re-measures and re-announces.
			read(current.title);
			read(current.description);
			if (current.removing) return;
			queueMicrotask(() => {
				measure();
				const text = spoken();
				if (text === lastSpoken && current.type === lastType) return;
				lastSpoken = text;
				lastType = current.type;
				state.announce(text, current.type === "error");
			});
		});

		let timer: ReturnType<typeof setTimeout> | undefined;
		let startedAt = 0;
		let remaining = duration();
		let lastDuration = remaining;
		const clear = (): void => {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
		};
		const stopTimer = effect(() => {
			const current = record();
			const total = duration();
			if (total !== lastDuration) {
				remaining = total;
				lastDuration = total;
			}
			if (current.removing) {
				clear();
				// Untracked: this writes the heights the offset is read from.
				untrack(() => {
					offsetBeforeRemove = offset();
					state.setHeight(current.serial, undefined);
				});
				return;
			}
			if (current.type === "loading" || total === Number.POSITIVE_INFINITY) {
				clear();
				return;
			}
			if (state.paused()) {
				if (timer !== undefined) remaining -= Date.now() - startedAt;
				clear();
				return;
			}
			clear();
			startedAt = Date.now();
			timer = setTimeout(
				() => remove(current.id, "autoClose"),
				Math.max(remaining, 0),
			);
		});

		return () => {
			stopContent();
			stopTimer();
			clear();
		};
	});

	onUnmount(() => {
		state.setHeight(record().serial, undefined);
	});

	const typeKey = (): ToastType => record().type ?? "default";

	function surfaceClasses(): string {
		const current = record();
		const type = current.type;
		const classNames = state.options.classNames;
		const colours = !styled()
			? undefined
			: inverted()
				? INVERT[state.theme]
				: rich() &&
						type !== undefined &&
						type !== "default" &&
						type !== "loading"
					? RICH[type][state.theme]
					: NORMAL;
		return cn(
			TOAST_LAYOUT,
			styled() ? TOAST_STYLED : undefined,
			colours,
			state.options.class,
			current.class,
			classNames?.toast,
			current.classNames?.toast,
			classNames?.[typeKey()],
			current.classNames?.[typeKey()],
		);
	}

	function closeClasses(): string {
		const type = record().type;
		const colours =
			rich() && type !== undefined && type !== "default" && type !== "loading"
				? RICH[type][state.theme]
				: cn(NORMAL, CLOSE_HOVER[state.theme]);
		return cn(
			CLOSE_BUTTON,
			colours,
			state.options.classNames?.closeButton,
			record().classNames?.closeButton,
		);
	}

	function renderClose(): Child {
		const current = record();
		const show =
			(current.closeButton ?? state.closeButton) === true &&
			current.custom === undefined &&
			current.type !== "loading";
		if (!show) return null;
		return html`<button
			type="button"
			aria-label="${state.options.closeButtonAriaLabel ?? "Close toast"}"
			data-close-button
			data-disabled="${String(current.type === "loading")}"
			class="${closeClasses}"
			@click="${() => {
				if (dismissible()) remove(record().id, "dismiss");
			}}"
		>${state.icons?.close ?? XIcon({ class: "size-3" })}</button>`;
	}

	function renderIcon(): Child {
		const current = record();
		if (current.icon === null) return null;
		const type = current.type;
		let icon: Child;
		if (current.icon !== undefined) icon = current.icon;
		else if (
			type !== undefined &&
			state.icons !== undefined &&
			type in state.icons
		) {
			icon = type === "default" ? null : state.icons[type];
		} else icon = defaultIcon(type);
		if (icon === null || icon === undefined || icon === false) return null;
		return html`<div
			data-icon
			class="${cn(
				"relative flex size-4 shrink-0 items-center justify-start -ms-[3px] me-1",
				state.options.classNames?.icon,
				current.classNames?.icon,
			)}"
		>${icon}</div>`;
	}

	function renderButton(kind: "cancel" | "action"): Child {
		const current = record();
		const action = kind === "cancel" ? current.cancel : current.action;
		if (action === undefined) return null;
		const classNames = state.options.classNames;
		const classes =
			kind === "cancel"
				? cn(
						BUTTON,
						"text-popover-foreground",
						CANCEL[state.theme],
						classNames?.cancelButton,
						current.classNames?.cancelButton,
					)
				: cn(
						BUTTON,
						"bg-popover-foreground text-popover",
						classNames?.actionButton,
						current.classNames?.actionButton,
					);
		return html`<button
			type="button"
			data-button
			data-cancel="${kind === "cancel" ? "" : undefined}"
			data-action="${kind === "action" ? "" : undefined}"
			class="${classes}"
			@click="${(event: MouseEvent) => {
				if (kind === "cancel") {
					if (!dismissible()) return;
					action.onClick(event);
					remove(record().id, "silent");
					return;
				}
				action.onClick(event);
				if (event.defaultPrevented) return;
				remove(record().id, "silent");
			}}"
		>${action.label}</button>`;
	}

	function renderDescription(): Child {
		const current = record();
		if (current.description === undefined) return null;
		return html`<div
			data-description
			class="${cn(
				"font-normal leading-[1.4]",
				rich() ? "text-inherit" : DESCRIPTION[state.theme],
				state.options.descriptionClass,
				current.descriptionClass,
				state.options.classNames?.description,
				current.classNames?.description,
			)}"
		>${read(current.description)}</div>`;
	}

	return html`<li
		id="${rowId}"
		tabindex="0"
		data-slot="sonner-toast"
		data-sonner-toast
		data-type="${() => record().type}"
		data-rich-colors="${() => String(rich())}"
		data-styled="${() => String(styled())}"
		data-mounted="${() => String(mounted())}"
		data-promise="${() => String(record().promise === true)}"
		data-removed="${() => String(record().removing)}"
		data-visible="${() => String(isVisible())}"
		data-y-position="${y}"
		data-x-position="${x}"
		data-index="${() => String(props.index())}"
		data-front="${() => String(isFront())}"
		data-dismissible="${() => String(dismissible())}"
		data-invert="${() => String(inverted())}"
		data-expanded="${() => String(isExpanded())}"
		data-testid="${() => record().testId}"
		class="${surfaceClasses}"
		.style="${style}"
	>${renderClose}${renderIcon}<div
			data-content
			class="${() =>
				cn(
					"flex min-w-0 flex-1 flex-col gap-0.5",
					state.options.classNames?.content,
					record().classNames?.content,
				)}"
		><div
				data-title
				class="${() =>
					cn(
						"font-medium leading-normal",
						state.options.classNames?.title,
						record().classNames?.title,
					)}"
			>${() => record().custom ?? read(record().title)}</div>${renderDescription}</div>${() => renderButton("cancel")}${() => renderButton("action")}${() =>
				isExpanded() && !record().removing
					? html`<span
						aria-hidden="true"
						class="absolute left-0 bottom-full w-full"
						.style="${`height:${state.gap + 1}px`}"
					></span>`
					: null}</li>`;
});
