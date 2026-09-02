import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tailwind reads this source as TEXT. It never runs it.
 *
 * So a variant assembled at runtime — `` `[&_input]:${classes.split(" ").join(" [&_input]:")}` ``
 * — is never a literal anywhere, no rule is generated for it, and the element
 * ends up carrying class names no stylesheet defines. Nothing throws, the
 * markup looks correct, and only the pixels are wrong. That is what makes this
 * worth a test rather than a review habit: the failure is silent by nature.
 *
 * Both real occurrences shipped in a published version before anyone noticed.
 */

// `process.cwd()` rather than `import.meta.url`: vitest runs from the package
// root, and under the jsdom environment the module URL does not resolve to a
// filesystem path.
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...sourceFiles(full));
		else if (entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

/** A closed Tailwind variant (`…]:`) immediately followed by an interpolation. */
const COMPUTED_VARIANT = /\]:\$\{/;

function isComment(line: string): boolean {
	const trimmed = line.trimStart();
	return (
		trimmed.startsWith("//") ||
		trimmed.startsWith("*") ||
		trimmed.startsWith("/*")
	);
}

describe("Tailwind class names", () => {
	it("are never built by interpolating into a variant", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(SRC)) {
			const lines = readFileSync(file, "utf8").split("\n");
			lines.forEach((line, index) => {
				if (isComment(line)) return;
				if (COMPUTED_VARIANT.test(line)) {
					offenders.push(`${file.slice(SRC.length + 1)}:${index + 1}`);
				}
			});
		}

		expect(
			offenders,
			"a variant built at runtime generates no CSS — write it out as a literal",
		).toEqual([]);
	});
});
