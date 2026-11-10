/**
 * InputOTP — a one-time code entered one character per box.
 *
 * The behaviour users expect from this control is entirely in the edge cases,
 * and each one is a separate rule:
 *
 * - Typing advances to the next box; the last one stays put rather than
 *   wrapping round to the first.
 * - Backspace in an empty box clears the *previous* one and moves back, which
 *   is what makes holding it down erase the whole code.
 * - Pasting a code fills every box from wherever it was pasted, so the common
 *   case — copy the code out of the email, click the first box, paste — works.
 * - `inputmode="numeric"` and `autocomplete="one-time-code"` are what get the
 *   numeric keypad on mobile and the OS's SMS autofill suggestion. Without the
 *   second, a user has to leave the app to read the code.
 *
 * The joined value is mirrored into a hidden input so the control submits as
 * one field, rather than six.
 */

import {
	component,
	createContext,
	html,
	inject,
	provide,
	signal,
} from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { MinusIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read, readOr } from "../lib/props.js";

const slotClasses =
	"border-input relative flex size-9 items-center justify-center border-y border-r text-center text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md focus:border-ring focus:ring-ring/50 focus:z-10 focus:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

interface InputOTPApi {
	readonly length: number;
	readonly inputMode: "numeric" | "text";
	readonly disabled: () => boolean;
	readonly slotLabel: (position: number, length: number) => string;
	/** Claim the next box's index, in the order the slots are built. */
	claimSlot(): number;
	onInput(index: number, event: Event): void;
	onKeyDown(index: number, event: KeyboardEvent): void;
	onPaste(index: number, event: ClipboardEvent): void;
}

const InputOTPContext = createContext<InputOTPApi>("InputOTP");

/** input-otp's patterns, for the `pattern` prop. */
export const REGEXP_ONLY_DIGITS = "^\\d+$";
export const REGEXP_ONLY_CHARS = "^[a-zA-Z]+$";
export const REGEXP_ONLY_DIGITS_AND_CHARS = "^[a-zA-Z0-9]+$";

export interface InputOTPProps {
	/** Number of boxes. Default `6` — and it must match the slots built. */
	length?: number;
	/**
	 * What the code may hold, tested against the whole value as input-otp
	 * does: a character or a fill that would not match is refused. None by
	 * default, as input-otp; `REGEXP_ONLY_DIGITS` for a numeric code.
	 */
	pattern?: RegExp | string;
	/** The on-screen keyboard. Default `"numeric"`. */
	inputMode?: "numeric" | "text";
	/** Each box's accessible name from its position. Default `"Character 2 of 6"`. */
	slotLabel?: (position: number, length: number) => string;
	name?: string;
	disabled?: Reactive<boolean>;
	class?: Reactive<string>;
	onValueChange?: (value: string) => void;
	/** Fired once every box is filled. */
	onComplete?: (value: string) => void;
	children?: Parts;
}

export const InputOTP = component<InputOTPProps>((props) => {
	const length = props.length ?? 6;
	const groupId = uid("input-otp");
	const characters = signal<readonly string[]>(new Array(length).fill(""));
	let claimed = 0;

	function boxes(): HTMLInputElement[] {
		const root = document.getElementById(groupId);
		if (root === null) return [];
		const found: HTMLInputElement[] = [];
		for (const node of root.querySelectorAll("input[data-otp-index]")) {
			if (node instanceof HTMLInputElement) found.push(node);
		}
		return found;
	}

	function focusBox(index: number): void {
		const target = boxes()[Math.min(Math.max(index, 0), length - 1)];
		target?.focus();
		target?.select();
	}

	function commit(next: readonly string[]): void {
		characters(next);
		const joined = next.join("");
		props.onValueChange?.(joined);
		if (joined.length === length && !next.includes(""))
			props.onComplete?.(joined);
	}

	function write(index: number, character: string): void {
		const next = [...characters()];
		next[index] = character;
		commit(next);
	}

	const pattern =
		typeof props.pattern === "string"
			? new RegExp(props.pattern)
			: props.pattern;

	function accepts(next: readonly string[]): boolean {
		const joined = next.join("");
		return pattern === undefined || joined === "" || pattern.test(joined);
	}

	/** Put the boxes back to what the code holds. */
	function reflect(): void {
		const inputs = boxes();
		characters().forEach((character, position) => {
			const input = inputs[position];
			if (input !== undefined) input.value = character;
		});
	}

	/**
	 * Share a run of characters out over the boxes from `index`: a paste, and
	 * a whole code an autofill or an IME put into one box.
	 */
	function spread(index: number, text: string): void {
		const next = [...characters()];
		let cursor = index;
		for (const character of text) {
			if (cursor >= length) break;
			next[cursor] = character;
			cursor += 1;
		}
		if (accepts(next)) commit(next);
		// The boxes are uncontrolled between keystrokes, so writing the signal
		// alone would leave the characters invisible — or a refused fill in place.
		reflect();
		focusBox(Math.min(cursor, length - 1));
	}

	provide<InputOTPApi>(InputOTPContext, {
		length,
		inputMode: props.inputMode ?? "numeric",
		disabled: () => readOr(props.disabled, false),
		slotLabel:
			props.slotLabel ??
			((position, total) => `Character ${position} of ${total}`),
		claimSlot() {
			const index = claimed;
			claimed += 1;
			return index;
		},
		onInput(index, event) {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) return;

			const value = target.value;
			// One key pressed in a box already holding a character: the box holds
			// both, and the one just typed is what counts.
			const typed =
				event instanceof InputEvent &&
				event.inputType === "insertText" &&
				event.data !== null &&
				[...event.data].length === 1
					? event.data
					: undefined;
			if ([...value].length > 1 && typed === undefined) {
				// A whole code at once: autofill, a password manager, an IME.
				spread(index, value);
				return;
			}
			const character = typed ?? value;
			const next = [...characters()];
			next[index] = character;
			if (!accepts(next)) {
				target.value = characters()[index] ?? "";
				return;
			}
			target.value = character;
			commit(next);
			if (character !== "" && index < length - 1) focusBox(index + 1);
		},
		onKeyDown(index, event) {
			if (event.key === "Backspace") {
				if (characters()[index] === "" && index > 0) {
					event.preventDefault();
					write(index - 1, "");
					focusBox(index - 1);
				}
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				focusBox(index - 1);
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				focusBox(index + 1);
			}
		},
		onPaste(index, event) {
			const pasted = event.clipboardData?.getData("text") ?? "";
			if (pasted === "") return;
			event.preventDefault();
			spread(index, pasted);
		},
	});

	return html`<div
		data-slot="input-otp"
		id="${groupId}"
		class="${() => cn("flex items-center gap-2", read(props.class))}"
	>${props.children?.()}<input
			type="hidden"
			name="${props.name}"
			.value="${() => characters().join("")}"
		/></div>`;
});

export interface InputOTPGroupProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** A run of boxes with no gap between them. */
export const InputOTPGroup = component<InputOTPGroupProps>(
	(props) => html`<div
		data-slot="input-otp-group"
		class="${() => cn("flex items-center", read(props.class))}"
	>${slot(props.children)}</div>`,
);

export interface InputOTPSlotProps {
	class?: Reactive<string>;
}

/**
 * One box.
 *
 * Claims its index as it is built, so the slots need no index prop and cannot
 * be numbered wrongly. A real `<input>` per box rather than a single field
 * with drawn cells: it is what gives each box its own caret, its own
 * `autocomplete` and the one-time-code hint the platform fills from an SMS.
 */
export const InputOTPSlot = component<InputOTPSlotProps>((props) => {
	const otp = inject(InputOTPContext);
	const index = otp.claimSlot();
	return html`<input
		data-slot="input-otp-slot"
		data-otp-index="${index}"
		type="text"
		inputmode="${otp.inputMode}"
		autocomplete="${index === 0 ? "one-time-code" : "off"}"
		maxlength="${otp.length}"
		aria-label="${otp.slotLabel(index + 1, otp.length)}"
		?disabled="${() => otp.disabled()}"
		class="${() => cn(slotClasses, read(props.class))}"
		@input="${(event: Event) => otp.onInput(index, event)}"
		@keydown="${(event: KeyboardEvent) => otp.onKeyDown(index, event)}"
		@paste="${(event: ClipboardEvent) => otp.onPaste(index, event)}"
	/>`;
});

export interface InputOTPSeparatorProps {
	class?: Reactive<string>;
}

/** The dash between two groups. Decorative — the boxes carry the labels. */
export const InputOTPSeparator = component<InputOTPSeparatorProps>(
	(props) => html`<div
		data-slot="input-otp-separator"
		role="separator"
		aria-hidden="true"
		class="${() => cn("text-muted-foreground mx-1", read(props.class))}"
	>${MinusIcon({ class: "size-4" })}</div>`,
);
