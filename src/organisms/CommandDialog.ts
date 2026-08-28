/**
 * CommandDialog — the command palette, full screen.
 *
 * `Command` on its own is a list you place somewhere. This is the form people
 * mean by "command palette": a modal over the page, opened by a keyboard
 * shortcut, dismissed by Escape or a click outside.
 *
 * An organism composing another organism — `Command` inside `modalSurface`.
 * Nothing about the palette's behaviour is re-implemented here; the filter,
 * the highlight and the keyboard model stay in `Command`, and this file adds
 * only the modal shell and the shortcut.
 *
 * The shortcut is opt-in but built in, because binding it correctly is
 * fiddlier than it looks: it has to be a capturing document listener (a menu
 * or a dialog already open would otherwise swallow it), it has to preventDefault
 * (⌘K is "focus the search bar" in several browsers), and it has to toggle
 * rather than open, so the same keystroke closes it.
 *
 * The title is present but visually hidden. A dialog with no accessible name
 * is announced as just "dialog"; giving it one costs nothing and the palette's
 * own search field is the visible affordance.
 */

import { component, html, onMount, onUnmount } from "@c9up/aurora";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { fadeInOut, zoomInOut } from "../lib/motion.js";
import { type Reactive, read } from "../lib/props.js";
import { controllable } from "../primitives/controllable.js";
import { modalSurface } from "../primitives/modalSurface.js";
import { Command, type CommandItem, type CommandProps } from "./Command.js";
import { dialogBackdropClasses } from "./Dialog.js";

export interface CommandDialogProps extends Omit<CommandProps, "class"> {
	/** Announced on open. Hidden visually unless `showTitle`. */
	title?: Child;
	description?: Child;
	showTitle?: boolean;
	open?: Reactive<boolean>;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	/**
	 * A single character that opens the palette with the platform's command
	 * modifier — `"k"` gives ⌘K on macOS and Ctrl+K elsewhere. Omit for a
	 * palette opened only from your own code.
	 */
	shortcut?: string;
	contentClass?: Reactive<string>;
}

export const CommandDialog = component<CommandDialogProps>((props) => {
	const panelId = uid("command-dialog-panel");
	const titleId = uid("command-dialog-title");
	const descriptionId = uid("command-dialog-description");

	const state = controllable<boolean>({
		value: props.open,
		initial: props.defaultOpen ?? false,
		onChange: props.onOpenChange,
	});

	/**
	 * Toggle, not open — the same keystroke has to close it.
	 *
	 * Captured at the document, so a menu or popover that is already open does
	 * not consume the key on its way up. `metaKey || ctrlKey` covers both
	 * platforms without sniffing the user agent.
	 */
	function onKeyDown(event: KeyboardEvent): void {
		if (props.shortcut === undefined) return;
		if (event.key.toLowerCase() !== props.shortcut.toLowerCase()) return;
		if (!event.metaKey && !event.ctrlKey) return;
		event.preventDefault();
		state.set(!state.current());
	}

	onMount(() => {
		if (props.shortcut === undefined) return;
		document.addEventListener("keydown", onKeyDown, true);
	});
	onUnmount(() => document.removeEventListener("keydown", onKeyDown, true));

	function close(): void {
		state.set(false);
	}

	function runAndClose(item: CommandItem): void {
		props.onSelect?.(item);
		// Closing after the action, not before: a handler that opens another
		// surface should not have this one tearing down focus underneath it.
		close();
	}

	modalSurface({
		open: () => state.current(),
		onClose: close,
		panel: (root) => root.querySelector(`#${CSS.escape(panelId)}`),
		// The search field, not the first focusable — the whole point of the
		// palette is that you can start typing immediately.
		initialFocus: (panel) => panel.querySelector("input"),
		content: () =>
			html`<div
				data-slot="command-dialog-overlay"
				class="${cn("fixed inset-0 z-50", fadeInOut)}"
			>
				<div class="${dialogBackdropClasses}"></div>
				<div
					data-slot="command-dialog"
					id="${panelId}"
					role="dialog"
					aria-modal="true"
					aria-labelledby="${titleId}"
					aria-describedby="${props.description === undefined ? undefined : descriptionId}"
					tabindex="-1"
					class="${cn(
						"bg-popover fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border shadow-lg outline-none",
						zoomInOut,
						read(props.contentClass),
					)}"
				>
					<h2
						id="${titleId}"
						class="${cn(
							"px-4 pt-4 text-sm font-medium",
							props.showTitle === true ? "" : "sr-only",
						)}"
					>${props.title ?? "Command palette"}</h2>
					${
						props.description === undefined
							? null
							: html`<p id="${descriptionId}" class="sr-only">${props.description}</p>`
					}
					${Command({
						items: props.items,
						placeholder: props.placeholder,
						emptyMessage: props.emptyMessage,
						filter: props.filter,
						onSelect: runAndClose,
					})}
				</div>
			</div>`,
	});

	// The palette has no trigger of its own — it is opened by the shortcut or
	// by the `open` prop. Something still has to sit in the tree for the
	// component to mount into; the surface itself lives in a portal.
	return html`<span data-slot="command-dialog-root" hidden></span>`;
});
