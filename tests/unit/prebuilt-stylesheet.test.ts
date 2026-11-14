import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { switchTrackClasses } from "../../src/atoms/Switch.js";

/**
 * `nebula.css` is a build artefact (`pnpm css`) that the `css` adapter ships
 * verbatim — no scanner runs in that app, so whatever is missing here is
 * missing for good. It is worth asserting on the file itself rather than only
 * on the source that generates it.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const stylesheet = readFileSync(join(root, "nebula.css"), "utf8");

/**
 * Every flat `selector{declarations}` rule of the utilities layer — what a
 * component's classes produce. The preflight's resets sit in a lower layer and
 * lose to any of them.
 */
const rules = Array.from(
	stylesheet
		.slice(stylesheet.indexOf("@layer utilities{"))
		.matchAll(/([^{}@;]+)\{([^{}]*)\}/g),
	([, selector = "", body = ""]) => ({ selector: selector.trim(), body }),
);

/**
 * The background colours the stylesheet's rules give a Switch track, in a page
 * of `theme`, on or off — every rule that matches it, whatever wins between
 * them: a fill for the other state must not match at all.
 */
function trackFills(theme: string, checked: boolean): string[] {
	const page = document.createElement("div");
	if (theme === "dark") page.className = "dark";
	const track = document.createElement("input");
	track.type = "checkbox";
	track.className = switchTrackClasses;
	track.checked = checked;
	page.append(track);
	document.body.append(page);
	try {
		const fills: string[] = [];
		for (const { selector, body } of rules) {
			const fill = /background-color:([^;]+)/.exec(body)?.[1];
			if (fill === undefined) continue;
			const matches = selector.split(",").some((one) => {
				try {
					return track.matches(one);
				} catch {
					return false;
				}
			});
			if (matches) fills.push(fill);
		}
		return fills;
	} finally {
		page.remove();
	}
}

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

	it("keeps a checked box on the primary fill in the dark theme", () => {
		// `dark:bg-input/30` and `checked:bg-primary` have the same specificity,
		// and Tailwind sorts the `dark:` variant later, so in the dark theme a
		// checked box kept the near-transparent fill and its dark tick vanished.
		// The `dark:checked:` rule carries one more pseudo-class and wins.
		expect(stylesheet).toContain(
			".dark\\:checked\\:bg-primary:is(.dark *):checked,.dark\\:indeterminate\\:bg-primary:is(.dark *):indeterminate{background-color:var(--primary)}",
		);
	});

	it("keeps a switch that is on on the primary fill, in either theme", () => {
		// The track carried `dark:bg-input/80` beside `checked:bg-primary`: two
		// classes each, the `dark:` one emitted later, so in the dark theme a
		// switch that was on kept the off fill and looked off. As upstream, the
		// off fill now applies to the unchecked track only, and nothing else
		// fills a checked one.
		for (const theme of ["light", "dark"]) {
			for (const checked of [true, false]) {
				const fills = trackFills(theme, checked);
				expect({ theme, checked, fills }).toEqual({
					theme,
					checked,
					fills: checked
						? ["var(--primary)"]
						: fills.filter((fill) => fill !== "var(--primary)"),
				});
				expect(fills.length).toBeGreaterThan(0);
			}
		}
	});

	it("still carries the tokens both rules read", () => {
		// The rules above are worth nothing if the palette they reference is not
		// in the same file — the css adapter imports this one and nothing else.
		expect(stylesheet).toContain("--border:");
		expect(stylesheet).toContain("--background:");
	});
});
