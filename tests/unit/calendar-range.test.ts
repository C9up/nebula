import { describe, expect, it } from "vitest";
import { nextRange, rangePosition } from "../../src/organisms/Calendar.js";

const day = (n: number): Date => new Date(2026, 5, n);

describe("nextRange", () => {
	it("starts a span from nothing", () => {
		expect(nextRange(undefined, day(10))).toEqual({ from: day(10) });
	});

	it("closes an open span on the second click", () => {
		expect(nextRange({ from: day(10) }, day(14))).toEqual({
			from: day(10),
			to: day(14),
		});
	});

	it("starts over rather than inverting when the second click is earlier", () => {
		// The user who clicks the 3rd after the 10th means to start again, not to
		// select the week between them.
		expect(nextRange({ from: day(10) }, day(3))).toEqual({ from: day(3) });
	});

	it("closes a one-day span on the same date", () => {
		expect(nextRange({ from: day(10) }, day(10))).toEqual({
			from: day(10),
			to: day(10),
		});
	});

	it("starts a fresh span once one is complete", () => {
		expect(nextRange({ from: day(10), to: day(14) }, day(20))).toEqual({
			from: day(20),
		});
	});
});

describe("rangePosition", () => {
	it("places nothing when there is no span", () => {
		expect(rangePosition(day(10), undefined, undefined)).toBe("none");
	});

	it("marks the lone fixed end while the span is still open", () => {
		expect(rangePosition(day(10), { from: day(10) }, undefined)).toBe("single");
		expect(rangePosition(day(11), { from: day(10) }, undefined)).toBe("none");
	});

	it("places the two ends and the interior", () => {
		const span = { from: day(10), to: day(14) };
		expect(rangePosition(day(10), span, span.to)).toBe("start");
		expect(rangePosition(day(14), span, span.to)).toBe("end");
		expect(rangePosition(day(12), span, span.to)).toBe("middle");
		expect(rangePosition(day(9), span, span.to)).toBe("none");
		expect(rangePosition(day(15), span, span.to)).toBe("none");
	});

	it("orders the ends when the preview sweeps backwards", () => {
		// Pointer at the 5th while the 10th is fixed: the span runs 5→10, so the
		// 5th is the start even though it arrived second.
		const open = { from: day(10) };
		expect(rangePosition(day(5), open, day(5))).toBe("start");
		expect(rangePosition(day(10), open, day(5))).toBe("end");
		expect(rangePosition(day(7), open, day(5))).toBe("middle");
	});

	it("treats a one-day span as neither end", () => {
		// Both ends on the same cell: squaring either side would leave a lone
		// cell with a flat edge against nothing.
		const span = { from: day(10), to: day(10) };
		expect(rangePosition(day(10), span, span.to)).toBe("single");
		expect(rangePosition(day(11), span, span.to)).toBe("none");
	});

	it("ignores the time of day on either end", () => {
		const span = {
			from: new Date(2026, 5, 10, 23, 59),
			to: new Date(2026, 5, 12, 0, 1),
		};
		expect(rangePosition(day(10), span, span.to)).toBe("start");
		expect(rangePosition(day(12), span, span.to)).toBe("end");
	});
});
