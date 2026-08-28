import { describe, expect, it } from "vitest";
import { formatBytes } from "../../src/molecules/Attachment.js";
import {
	isAnswered,
	type Question,
} from "../../src/organisms/Questionnaire.js";

describe("formatBytes", () => {
	it("keeps raw bytes below a kilobyte", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(999)).toBe("999 B");
	});

	it("uses binary units, matching what a file manager shows", () => {
		// Decimal units would call this 1.0 kB and disagree with the OS for the
		// same file, which reads as a bug.
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
		expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
	});

	it("drops the decimal once the number is large enough to not need it", () => {
		expect(formatBytes(Math.round(9.4 * 1024 * 1024))).toBe("9.4 MB");
		expect(formatBytes(Math.round(941.3 * 1024 * 1024))).toBe("941 MB");
	});

	it("stops at terabytes rather than inventing a unit", () => {
		expect(formatBytes(1024 ** 5)).toContain("TB");
	});

	it("returns nothing for a value that is not a size", () => {
		expect(formatBytes(-1)).toBe("");
		expect(formatBytes(Number.NaN)).toBe("");
	});
});

describe("isAnswered", () => {
	const single: Question = {
		id: "a",
		type: "single",
		prompt: "Pick one",
		options: [{ value: "x", label: "X" }],
	};
	const multiple: Question = {
		id: "b",
		type: "multiple",
		prompt: "Pick some",
		options: [{ value: "x", label: "X" }],
	};
	const text: Question = { id: "c", type: "text", prompt: "Say something" };

	it("treats an absent answer as unanswered", () => {
		for (const question of [single, multiple, text]) {
			expect(isAnswered(question, undefined)).toBe(false);
		}
	});

	it("treats an empty multiple-choice set as unanswered", () => {
		expect(isAnswered(multiple, [])).toBe(false);
		expect(isAnswered(multiple, ["x"])).toBe(true);
	});

	it("treats whitespace-only free text as unanswered", () => {
		// Otherwise a required question is satisfied by pressing the space bar.
		expect(isAnswered(text, "   ")).toBe(false);
		expect(isAnswered(text, "")).toBe(false);
		expect(isAnswered(text, "yes")).toBe(true);
	});

	it("accepts a chosen single value", () => {
		expect(isAnswered(single, "x")).toBe(true);
	});
});
