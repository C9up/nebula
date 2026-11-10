/**
 * A whole code delivered into one box: the platform's one-time-code autofill,
 * a password manager's TOTP fill, an IME. input-otp takes it because its one
 * input holds the whole code; here the boxes share it out, as a paste does.
 * And, as input-otp, a `pattern` refuses what does not match.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
	REGEXP_ONLY_DIGITS,
} from "../../src/molecules/InputOTP.js";
import { mount } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

function otp(options: {
	pattern?: RegExp | string;
	onComplete?: (value: string) => void;
	onValueChange?: (value: string) => void;
}) {
	return mount(
		InputOTP({
			length: 6,
			name: "code",
			...options,
			children: () =>
				InputOTPGroup({
					children: Array.from({ length: 6 }, () => InputOTPSlot({})),
				}),
		}),
	);
}

const boxes = (): HTMLInputElement[] => [
	...document.querySelectorAll<HTMLInputElement>("input[data-otp-index]"),
];
const hidden = (): string | undefined =>
	document.querySelector<HTMLInputElement>("input[type='hidden']")?.value;

/** What an autofill looks like: the whole value, no single typed key. */
function fill(box: HTMLInputElement | undefined, value: string): void {
	if (box === undefined) return;
	box.value = value;
	box.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("InputOTP > a whole code in one box", () => {
	it("lets the first box take the whole code", () => {
		const view = otp({});
		expect(boxes()[0]?.getAttribute("maxlength")).toBe("6");
		expect(boxes()[0]?.getAttribute("autocomplete")).toBe("one-time-code");
		view.dispose();
	});

	it("shares an autofilled code out over every box, completing once", () => {
		const onComplete = vi.fn();
		const view = otp({ onComplete });
		fill(boxes()[0], "123456");
		expect(boxes().map((box) => box.value)).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
		]);
		expect(hidden()).toBe("123456");
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onComplete).toHaveBeenCalledWith("123456");
		view.dispose();
	});

	it("fills from the box it landed in", () => {
		const view = otp({});
		fill(boxes()[2], "9876");
		expect(hidden()).toBe("9876");
		expect(boxes()[2]?.value).toBe("9");
		expect(boxes()[5]?.value).toBe("6");
		view.dispose();
	});
});

describe("InputOTP > pattern", () => {
	it("refuses a character the pattern does not allow", () => {
		const onValueChange = vi.fn();
		const view = otp({ pattern: REGEXP_ONLY_DIGITS, onValueChange });
		fill(boxes()[0], "a");
		expect(boxes()[0]?.value).toBe("");
		expect(onValueChange).not.toHaveBeenCalled();
		fill(boxes()[0], "7");
		expect(hidden()).toBe("7");
		view.dispose();
	});

	it("refuses a filled or pasted code that does not match, whole", () => {
		const onComplete = vi.fn();
		const view = otp({ pattern: "^\\d+$", onComplete });
		fill(boxes()[0], "12ab56");
		expect(hidden()).toBe("");
		expect(boxes().every((box) => box.value === "")).toBe(true);
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", {
			value: { getData: () => "12-456" },
		});
		boxes()[0]?.dispatchEvent(paste);
		expect(hidden()).toBe("");
		expect(onComplete).not.toHaveBeenCalled();
		view.dispose();
	});

	it("accepts anything without a pattern, as input-otp", () => {
		const view = otp({});
		fill(boxes()[0], "AB12cd");
		expect(hidden()).toBe("AB12cd");
		view.dispose();
	});
});
