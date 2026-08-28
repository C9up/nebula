/**
 * MessageScroller — a conversation that stays pinned to the newest message.
 *
 * The whole component is one rule and its exception: **follow the bottom, but
 * never yank the reader.**
 *
 * A chat log that always scrolls to the end is unusable the moment you scroll
 * up to re-read something and a new message arrives. One that never scrolls is
 * unusable in the ordinary case. So the container remembers whether the reader
 * was already at the bottom when the content grew: if they were, it follows; if
 * they had scrolled away, it holds position and offers a button instead.
 *
 * Growth is detected with a `ResizeObserver` on the inner wrapper rather than
 * by counting children. An image finishing its load, a code block wrapping, a
 * streamed reply growing token by token — none of those change the child count,
 * and all of them move the bottom.
 *
 * `atBottom` carries a tolerance because a scroll position is fractional on a
 * scaled display: `scrollTop + clientHeight` lands a fraction short of
 * `scrollHeight` at the true bottom, and an exact comparison would decide the
 * reader had scrolled away when they had not.
 *
 * `role="log"` with `aria-live="polite"`: new turns are announced as they
 * arrive, without interrupting whatever is being read.
 */

import { component, html, onMount, onUnmount, signal } from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ChevronDownIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

/** How far from the true bottom still counts as "at the bottom", in px. */
const BOTTOM_TOLERANCE = 24;

export interface MessageScrollerProps {
	children?: Slot;
	/** Announced as the log's name. */
	label?: string;
	/** Label for the catch-up button. Default `"Jump to latest"`. */
	jumpLabel?: string;
	class?: Reactive<string>;
}

export const MessageScroller = component<MessageScrollerProps>((props) => {
	const viewportId = uid("message-scroller");
	const contentId = uid("message-scroller-content");
	const pinned = signal(true);

	function viewport(): HTMLElement | null {
		return document.getElementById(viewportId);
	}

	function isAtBottom(element: HTMLElement): boolean {
		const distance =
			element.scrollHeight - element.scrollTop - element.clientHeight;
		return distance <= BOTTOM_TOLERANCE;
	}

	function scrollToBottom(smooth: boolean): void {
		const element = viewport();
		if (element === null) return;
		element.scrollTo({
			top: element.scrollHeight,
			behavior: smooth ? "smooth" : "auto",
		});
		pinned(true);
	}

	function onScroll(): void {
		const element = viewport();
		if (element === null) return;
		pinned(isAtBottom(element));
	}

	/**
	 * Follow the bottom only if we were already there.
	 *
	 * Read from the `pinned` signal rather than re-measuring: by the time the
	 * observer fires, the content has already grown and the viewport is no
	 * longer at the bottom by definition. The answer has to come from before.
	 */
	function onContentResize(): void {
		if (!pinned()) return;
		scrollToBottom(false);
	}

	let observer: ResizeObserver | undefined;

	onMount(() => {
		const element = viewport();
		if (element === null) return;

		element.addEventListener("scroll", onScroll, { passive: true });
		// Start at the newest message, without animating there.
		scrollToBottom(false);

		if (typeof ResizeObserver !== "function") return;
		const content = document.getElementById(contentId);
		if (content === null) return;
		observer = new ResizeObserver(onContentResize);
		observer.observe(content);
	});

	onUnmount(() => {
		viewport()?.removeEventListener("scroll", onScroll);
		observer?.disconnect();
	});

	return html`<div
		data-slot="message-scroller"
		class="${() => cn("relative flex min-h-0 flex-col", read(props.class))}"
	>
		<div
			data-slot="message-scroller-viewport"
			id="${viewportId}"
			role="log"
			aria-live="polite"
			aria-label="${props.label ?? "Conversation"}"
			tabindex="0"
			class="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none [scrollbar-width:thin]"
		>
			<div
				data-slot="message-scroller-content"
				id="${contentId}"
				class="flex flex-col gap-4 p-4"
			>${slot(props.children)}</div>
		</div>
		<button
			type="button"
			data-slot="message-scroller-jump"
			?hidden="${() => pinned()}"
			class="${cn(
				buttonVariants({ variant: "secondary", size: "sm" }),
				"absolute inset-x-0 bottom-3 mx-auto w-fit gap-1 rounded-full shadow-md",
			)}"
			@click="${() => scrollToBottom(true)}"
		>
			${ChevronDownIcon({ class: "size-4" })}
			${props.jumpLabel ?? "Jump to latest"}
		</button>
	</div>`;
});
