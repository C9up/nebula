import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `nebula.css` is a build artefact (`pnpm css`) that the `css` adapter ships
 * verbatim — no scanner runs in that app, so whatever is missing here is
 * missing for good. It is worth asserting on the file itself rather than only
 * on the source that generates it.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stylesheet = readFileSync(join(root, "nebula.css"), "utf8");

describe("nebula > prebuilt stylesheet", () => {
	it("gives every element the border token, after the preflight zeroes it", () => {
		// Tailwind's preflight sets `border: 0 solid` and stops there: v4 leaves
		// `border-color` at `currentColor`, so a component that lets the base
		// layer colour its border paints it in its own TEXT colour — measured in
		// Chromium as oklch(0.985 0 0), white, against a dark background.
		const rule = stylesheet.indexOf("*{border-color:var(--border)");
		expect(rule).toBeGreaterThan(-1);
		// Order decides which wins: both rules target `*` in the same layer.
		expect(rule).toBeGreaterThan(stylesheet.indexOf("border:0 solid"));
	});

	it("paints the page itself from the tokens", () => {
		expect(stylesheet).toContain("body{background-color:var(--background)");
	});

	it("still carries the tokens both rules read", () => {
		// The rules above are worth nothing if the palette they reference is not
		// in the same file — the css adapter imports this one and nothing else.
		expect(stylesheet).toContain("--border:");
		expect(stylesheet).toContain("--background:");
	});
});
