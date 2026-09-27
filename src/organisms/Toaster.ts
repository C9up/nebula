/**
 * Toaster — transient notifications.
 *
 * shadcn ships two: `sonner`, which wraps a third-party library, and `toast`,
 * its own, built on Base UI. nebula keeps it in-house with zero dependencies
 * and follows the SECOND — the shape is the same: one region mounted once near
 * the app root, and a `toast` object callable from anywhere with no reference
 * to it.
 *
 * NAMED DEVIATIONS from Base UI's manager, all deliberate:
 *
 * - `show` / `dismiss` / `variant` / `duration` rather than `add` / `close` /
 *   `type` / `timeout`. `variant` is what every other nebula component calls
 *   this (Button, Alert, Badge), and renaming it here alone would make the
 *   package less consistent with itself than with Base UI.
 * - `variant` keeps `warning`, which Base UI's `type` does not have.
 * - No `priority` (display ordering), `data` (typed payload for a React render
 *   prop — a `Child` already covers it) or `positionerProps` (anchored toasts).
 * - No `updateKey`. It exists to make React replay an animation without
 *   remounting; `update` here replaces the entry, and aurora re-renders it.
 *
 * That decoupling is the whole design. A queue in module state, a signal the
 * region subscribes to, and `toast.error(…)` works from a route handler's
 * error branch without threading a handle down to it.
 *
 * The accessibility rules are stricter than they look, and the region is
 * static so they can be satisfied:
 *
 * - The live region must exist **before** the toast does. A live region
 *   inserted with content already in it is not announced by most screen
 *   readers, which is why the region mounts empty and stays.
 * - `polite` for ordinary toasts, `assertive` for errors. Everything
 *   interrupting the user is the fastest way to make a screen reader
 *   unusable — so there are two regions, and each toast picks one.
 * - Hovering pauses the timers. A toast that vanishes while being read is the
 *   single most common complaint about the pattern.
 */

import { component, html, signal } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { LoaderIcon, XIcon } from "../lib/icons.js";
import { fadeInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";

export type ToastVariant =
	| "default"
	| "success"
	| "error"
	| "warning"
	| "loading";

/**
 * A toast's identity. A number when `show` minted it, a string when the caller
 * supplied one — which is what makes `update` and deduplication possible, and
 * how {@link toast.promise} turns one toast from loading into its outcome.
 */
export type ToastId = number | string;

export interface ToastOptions {
	title: Child;
	description?: Child;
	variant?: ToastVariant;
	/**
	 * Milliseconds on screen. `0` keeps it until dismissed.
	 *
	 * Left out, it comes from the variant: an error stays twice as long because
	 * the user has to read it and often act on it, and a `loading` toast does not
	 * leave on its own at all — it is waiting for an outcome.
	 */
	duration?: number;
	action?: { label: string; onClick: () => void };
	/**
	 * A stable id. Showing a toast under an id that is already on screen UPDATES
	 * it instead of stacking another — so "you are offline", raised on every
	 * failed request, is one toast rather than nine.
	 */
	id?: string;
	/** Called once the toast leaves, however it left. */
	onClose?: () => void;
}

interface ActiveToast extends Omit<ToastOptions, "id"> {
	readonly id: ToastId;
	readonly variant: ToastVariant;
}

const DEFAULT_DURATION_MS = 5000;

/** How long a variant stays when the caller did not say. */
function defaultDuration(variant: ToastVariant): number {
	if (variant === "loading") return 0;
	return variant === "error" ? DEFAULT_DURATION_MS * 2 : DEFAULT_DURATION_MS;
}

const queue = signal<readonly ActiveToast[]>([]);
const timers = new Map<ToastId, ReturnType<typeof setTimeout>>();
/** When each toast is due to disappear, as an epoch timestamp. */
const deadlines = new Map<ToastId, number>();
/** Time each toast had left when the pointer entered the region. */
const remainders = new Map<ToastId, number>();
let nextId = 0;

function dismiss(id: ToastId): void {
	const leaving = queue().find((entry) => entry.id === id);
	clearTimer(id);
	deadlines.delete(id);
	remainders.delete(id);
	queue(queue().filter((entry) => entry.id !== id));
	notifyClosed(leaving);
}

/**
 * Run a toast's `onClose`, without letting it take the caller down.
 *
 * The callback belongs to application code and runs from a timer, a click and
 * `clear()` alike. One that throws would otherwise break whichever of those
 * happened to be running — a dismissal that leaves the queue half-updated.
 */
function notifyClosed(entry: ActiveToast | undefined): void {
	if (entry?.onClose === undefined) return;
	try {
		entry.onClose();
	} catch (error) {
		console.error("[nebula] a toast onClose callback threw", error);
	}
}

function clearTimer(id: ToastId): void {
	const timer = timers.get(id);
	if (timer !== undefined) clearTimeout(timer);
	timers.delete(id);
}

function schedule(id: ToastId, duration: number): void {
	// A duration of zero means "stays until dismissed", so no timer and no
	// deadline — which is also what keeps pause/resume from resurrecting one.
	if (duration <= 0) return;
	clearTimer(id);
	timers.set(
		id,
		setTimeout(() => dismiss(id), duration),
	);
	deadlines.set(id, Date.now() + duration);
}

/** Hold every countdown while the pointer is over the region. */
function pauseAll(): void {
	const now = Date.now();
	for (const [id, deadline] of deadlines) {
		clearTimer(id);
		remainders.set(id, Math.max(deadline - now, 0));
	}
}

/**
 * Resume every held countdown.
 *
 * A minimum is applied: a toast the pointer rested on until its time ran out
 * would otherwise vanish the instant the pointer left, which reads as the
 * hover having dismissed it.
 */
function resumeAll(minimumMs: number): void {
	for (const [id, remaining] of remainders) {
		schedule(id, Math.max(remaining, minimumMs));
	}
	remainders.clear();
}

function show(options: ToastOptions): ToastId {
	// A supplied id that is already on screen updates rather than stacks.
	if (options.id !== undefined && has(options.id)) {
		update(options.id, options);
		return options.id;
	}
	let id: ToastId;
	if (options.id === undefined) {
		nextId += 1;
		id = nextId;
	} else {
		id = options.id;
	}
	const variant = options.variant ?? "default";
	const entry: ActiveToast = { ...options, id, variant };
	queue([...queue(), entry]);
	schedule(id, options.duration ?? defaultDuration(variant));
	return id;
}

function has(id: ToastId): boolean {
	return queue().some((entry) => entry.id === id);
}

/**
 * Change a toast that is already on screen. No-op if it has gone.
 *
 * The countdown is recomputed, because that is the part a caller would not
 * think to ask for and always wants: a `loading` toast has no timer at all, so
 * turning it into a success without rescheduling would leave it on screen for
 * good. Which is exactly what {@link toast.promise} does to it.
 */
function update(id: ToastId, patch: Partial<ToastOptions>): void {
	const current = queue().find((entry) => entry.id === id);
	if (current === undefined) return;
	const variant = patch.variant ?? current.variant;
	const next: ActiveToast = { ...current, ...patch, id, variant };
	queue(queue().map((entry) => (entry.id === id ? next : entry)));
	clearTimer(id);
	deadlines.delete(id);
	remainders.delete(id);
	schedule(id, patch.duration ?? next.duration ?? defaultDuration(variant));
}

/** What a `promise` stage says: just a title, or the whole toast. */
export type ToastMessage = Child | Omit<ToastOptions, "id" | "variant">;

function optionsOf(message: ToastMessage): Omit<ToastOptions, "id"> {
	// A plain object with a `title` is the options form; anything else — a
	// string, a number, a template — is the title itself. Checked on `title`
	// rather than on the shape in general, because a template result IS an
	// object and would otherwise be mistaken for options.
	if (
		typeof message === "object" &&
		message !== null &&
		"title" in message &&
		!Array.isArray(message)
	) {
		return message;
	}
	return { title: message };
}

function resolveMessage<T>(
	message: ToastMessage | ((value: T) => ToastMessage),
	value: T,
): Omit<ToastOptions, "id"> {
	if (typeof message === "function") {
		return optionsOf((message as (v: T) => ToastMessage)(value));
	}
	return optionsOf(message);
}

/**
 * Raise a toast. Returns its id, which `dismiss` accepts.
 *
 * Callable from anywhere — no component, no context, no handle.
 */
export const toast = {
	show,
	update,
	dismiss,
	success: (title: Child, description?: Child): ToastId =>
		show({ title, description, variant: "success" }),
	error: (title: Child, description?: Child): ToastId =>
		show({ title, description, variant: "error" }),
	warning: (title: Child, description?: Child): ToastId =>
		show({ title, description, variant: "warning" }),
	loading: (title: Child, description?: Child): ToastId =>
		show({ title, description, variant: "loading" }),
	/**
	 * One toast for the whole life of an async call: waiting, then the outcome.
	 *
	 * ```ts
	 * await toast.promise(save(form), {
	 *   loading: 'Saving…',
	 *   success: (saved) => `Saved ${saved.name}`,
	 *   error: (reason) => ({ title: 'Could not save', description: String(reason) }),
	 * })
	 * ```
	 *
	 * Returns the SAME promise it was given, rejection included. It reports, it
	 * does not handle: swallowing the rejection here would turn a failed call
	 * into a red toast and nothing else, with the caller's own error path never
	 * running.
	 */
	promise<T>(
		work: Promise<T>,
		messages: {
			loading: ToastMessage;
			success: ToastMessage | ((value: T) => ToastMessage);
			error: ToastMessage | ((reason: unknown) => ToastMessage);
		},
	): Promise<T> {
		const id = show({ ...optionsOf(messages.loading), variant: "loading" });
		// A separate chain, whose own rejection IS handled — so reporting the
		// failure never adds an unhandled rejection of its own.
		work.then(
			(value) => {
				update(id, {
					...resolveMessage(messages.success, value),
					variant: "success",
				});
			},
			(reason: unknown) => {
				update(id, {
					...resolveMessage(messages.error, reason),
					variant: "error",
				});
			},
		);
		return work;
	},
	/** Clear everything — on navigation, say. */
	clear(): void {
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
		deadlines.clear();
		remainders.clear();
		const leaving = queue();
		queue([]);
		// After the queue is empty, so a callback that raises a toast of its own
		// is not swept away by the clear that called it.
		for (const entry of leaving) notifyClosed(entry);
	},
};

const variantClasses: Record<ToastVariant, string> = {
	default: "bg-popover text-popover-foreground border",
	loading: "bg-popover text-muted-foreground border",
	success:
		"bg-popover text-popover-foreground border-l-4 border-l-primary border",
	error: "bg-popover text-destructive border-l-4 border-l-destructive border",
	warning:
		"bg-popover text-popover-foreground border-l-4 border-l-chart-4 border",
};

export interface ToasterProps {
	/** Which corner. Default `"bottom-right"`. */
	position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
	class?: Reactive<string>;
}

const positionClasses: Record<NonNullable<ToasterProps["position"]>, string> = {
	"top-right": "top-0 right-0 flex-col",
	"top-left": "top-0 left-0 flex-col",
	"bottom-right": "bottom-0 right-0 flex-col-reverse",
	"bottom-left": "bottom-0 left-0 flex-col-reverse",
};

/**
 * Mount once, near the root of the app.
 *
 * `data-nebula-live` marks it as exempt from the `aria-hidden` sweep a modal
 * performs over its siblings — a toast raised while a dialog is open still has
 * to be announced.
 */
export const Toaster = component<ToasterProps>((props) => {
	const position = props.position ?? "bottom-right";

	return html`<div
		data-slot="toaster"
		data-nebula-live
		class="${() =>
			cn(
				"pointer-events-none fixed z-100 flex max-h-screen w-full p-4 sm:max-w-sm",
				positionClasses[position],
				read(props.class),
			)}"
		@pointerenter="${pauseAll}"
		@pointerleave="${() => resumeAll(1000)}"
	>
		<div role="status" aria-live="polite" aria-atomic="false" class="contents">
			${() =>
				queue()
					.filter((entry) => entry.variant !== "error")
					.map(renderToast)}
		</div>
		<div role="alert" aria-live="assertive" aria-atomic="false" class="contents">
			${() =>
				queue()
					.filter((entry) => entry.variant === "error")
					.map(renderToast)}
		</div>
	</div>`;
});

function renderToast(entry: ActiveToast): Child {
	return html`<div
		data-slot="toast"
		data-variant="${entry.variant}"
		data-state="open"
		class="${cn(
			"pointer-events-auto mt-2 flex w-full items-start gap-3 rounded-md p-4 shadow-lg",
			variantClasses[entry.variant],
			fadeInOut,
		)}"
	>
		${
			entry.variant === "loading"
				? LoaderIcon({ class: "size-4 mt-0.5 shrink-0 animate-spin" })
				: null
		}
		<div class="flex-1 text-sm">
			<div class="font-medium">${entry.title}</div>
			${
				entry.description === undefined
					? null
					: html`<div class="text-muted-foreground mt-1">${entry.description}</div>`
			}
		</div>
		${
			entry.action === undefined
				? null
				: html`<button
					type="button"
					class="text-sm font-medium underline-offset-4 hover:underline"
					@click="${() => {
						entry.action?.onClick();
						dismiss(entry.id);
					}}"
				>${entry.action.label}</button>`
		}
		<button
			type="button"
			aria-label="Dismiss notification"
			class="opacity-60 transition-opacity hover:opacity-100"
			@click="${() => dismiss(entry.id)}"
		>${XIcon({ class: "size-4" })}</button>
	</div>`;
}
