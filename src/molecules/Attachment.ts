/**
 * Attachment — a file carried by a message.
 *
 * Two shapes from one component: an image renders as a thumbnail, anything
 * else as a chip with a name and a size. Splitting them into two components
 * would push the choice onto the caller, who usually has a MIME type and no
 * opinion.
 *
 * The size is formatted in binary units because that is what a file manager
 * shows for the same file — a "1.2 MB" here and a "1.1 MiB" there for one
 * upload reads as a bug.
 *
 * A removable attachment is a `<button>` beside the link, never a click
 * handler on the chip itself. Merging the two makes "open" and "delete" the
 * same gesture, distinguished only by where you land.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { XIcon } from "../lib/icons.js";
import { type Reactive, read } from "../lib/props.js";

export interface AttachmentProps {
	name: string;
	/** Bytes. Omitted for something not yet uploaded. */
	size?: number;
	/** MIME type. Anything under `image/` renders as a thumbnail. */
	type?: string;
	/** Opens the file. Without it the chip is inert. */
	href?: string;
	/** Thumbnail source, for an image. Defaults to `href`. */
	previewSrc?: string;
	/** Shows a remove button. */
	onRemove?: () => void;
	class?: Reactive<string>;
}

/**
 * Human-readable byte count, binary units.
 *
 * Deliberately not `Intl.NumberFormat`'s `unit: "byte"` style: it only speaks
 * decimal units (kB, MB), which disagrees with every desktop file manager.
 */
export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	// One decimal below 10, none above — "9.4 MB" is useful, "941.3 MB" is noise.
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export const Attachment = component<AttachmentProps>((props) => {
	const isImage = props.type?.startsWith("image/") === true;
	const preview = props.previewSrc ?? props.href;

	const removeButton =
		props.onRemove === undefined
			? null
			: html`<button
					type="button"
					data-slot="attachment-remove"
					aria-label="${`Remove ${props.name}`}"
					class="text-muted-foreground hover:text-foreground absolute end-1 top-1 rounded-sm bg-background/80 p-0.5 transition-colors"
					@click="${() => props.onRemove?.()}"
				>${XIcon({ class: "size-3.5" })}</button>`;

	if (isImage && preview !== undefined) {
		return html`<div
			data-slot="attachment"
			data-kind="image"
			class="${() => cn("relative w-fit overflow-hidden rounded-md border", read(props.class))}"
		>
			<a href="${props.href}" class="block">
				<img
					src="${preview}"
					alt="${props.name}"
					loading="lazy"
					class="max-h-48 max-w-64 object-cover"
				/>
			</a>
			${removeButton}
		</div>`;
	}

	const body = html`<span
			data-slot="attachment-icon"
			aria-hidden="true"
			class="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded text-[0.625rem] font-medium uppercase"
		>${extensionOf(props.name)}</span>
		<span class="flex min-w-0 flex-col">
			<span class="truncate text-sm font-medium">${props.name}</span>
			${
				props.size === undefined
					? null
					: html`<span class="text-muted-foreground text-xs tabular-nums"
						>${formatBytes(props.size)}</span
					>`
			}
		</span>`;

	return html`<div
		data-slot="attachment"
		data-kind="file"
		class="${() =>
			cn(
				"bg-background relative flex w-fit max-w-64 items-center gap-2 rounded-md border p-2 pe-7",
				read(props.class),
			)}"
	>
		${
			props.href === undefined
				? html`<span class="flex min-w-0 items-center gap-2">${body}</span>`
				: html`<a href="${props.href}" class="flex min-w-0 items-center gap-2 hover:underline"
					>${body}</a
				>`
		}
		${removeButton}
	</div>`;
});

/** The extension, for the icon tile. `"report.final.pdf"` → `"pdf"`. */
function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot <= 0 || dot === name.length - 1) return "?";
	return name.slice(dot + 1).slice(0, 4);
}
