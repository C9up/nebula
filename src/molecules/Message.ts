/**
 * Message — one turn in a conversation.
 *
 * Avatar, author, timestamp and a `Bubble`, laid out in reading order and
 * mirrored for an outgoing turn. `align: "end"` uses `flex-row-reverse`, so
 * the avatar moves to the inline end and the whole row follows the writing
 * direction — the same logical treatment as the bubble itself.
 *
 * The timestamp is a `<time datetime>`, always. The visible text is formatted
 * for the reader and may be relative ("2 min ago"), which a machine cannot
 * parse; `datetime` carries the ISO instant alongside it so a screen reader,
 * a scraper or a copy-paste keeps the real value.
 *
 * `role="article"` groups the parts, so a screen reader announces the author
 * once rather than reading a loose avatar, a name, a time and a paragraph as
 * four unrelated things.
 */

import { component, html } from "@c9up/aurora";
import { Avatar } from "../atoms/Avatar.js";
import type { Child } from "../lib/children.js";
import { type Slot, slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read } from "../lib/props.js";
import { Bubble, type BubbleProps, type BubbleReaction } from "./Bubble.js";

export interface MessageProps {
	/** The turn's content. Rendered inside a `Bubble`. */
	children?: Slot;
	author?: Child;
	avatarSrc?: string;
	/** Initials, when there is no picture. */
	avatarFallback?: Child;
	/** A `Date`, or an ISO string. Rendered as `<time datetime>`. */
	timestamp?: Date | string;
	/** How the timestamp reads. Defaults to a short local time. */
	formatTime?: (date: Date) => string;
	/** `"end"` for the current user's own turn. */
	align?: BubbleProps["align"];
	variant?: BubbleProps["variant"];
	reactions?: readonly BubbleReaction[];
	/** `Attachment`s, under the bubble. */
	attachments?: Slot;
	/** Shown under the bubble in place of a timestamp — "Sending…", "Failed". */
	status?: Child;
	class?: Reactive<string>;
}

/** Accept both shapes without making every caller construct a `Date`. */
function asDate(value: Date | string): Date | undefined {
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export const Message = component<MessageProps>((props) => {
	const outgoing = props.align === "end";
	const time =
		props.timestamp === undefined ? undefined : asDate(props.timestamp);
	const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

	const hasAvatar =
		props.avatarSrc !== undefined || props.avatarFallback !== undefined;

	return html`<div
		data-slot="message"
		role="article"
		data-align="${outgoing ? "end" : "start"}"
		class="${() =>
			cn(
				"flex w-full items-end gap-2",
				outgoing ? "flex-row-reverse" : "flex-row",
				read(props.class),
			)}"
	>
		${
			hasAvatar
				? Avatar({
						src: props.avatarSrc,
						alt: typeof props.author === "string" ? props.author : "",
						fallback: props.avatarFallback,
						class: "size-7 shrink-0",
					})
				: null
		}
		<div class="${cn("flex min-w-0 flex-1 flex-col gap-1", outgoing ? "items-end" : "items-start")}">
			${
				props.author === undefined
					? null
					: html`<span data-slot="message-author" class="text-muted-foreground px-1 text-xs font-medium"
						>${props.author}</span
					>`
			}
			${Bubble({
				variant: props.variant,
				align: props.align,
				reactions: props.reactions,
				children: props.children,
			})}
			${
				props.attachments === undefined
					? null
					: html`<div data-slot="message-attachments" class="flex flex-wrap gap-2">
						${slot(props.attachments)}
					</div>`
			}
			${renderFooter(props, time, timeFormat)}
		</div>
	</div>`;
});

function renderFooter(
	props: MessageProps,
	time: Date | undefined,
	timeFormat: Intl.DateTimeFormat,
): Child {
	if (props.status !== undefined) {
		return html`<span data-slot="message-status" class="text-muted-foreground px-1 text-xs"
			>${props.status}</span
		>`;
	}
	if (time === undefined) return null;
	return html`<time
		data-slot="message-time"
		datetime="${time.toISOString()}"
		class="text-muted-foreground px-1 text-xs tabular-nums"
	>${(props.formatTime ?? ((date: Date) => timeFormat.format(date)))(time)}</time>`;
}
