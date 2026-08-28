import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { add, detectLanguage } from "../../src/cli/add.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let project: string;

/**
 * A throwaway project with `@c9up/nebula` linked in.
 *
 * The CLI locates the package through `require.resolve` from the project's own
 * `package.json`, which is exactly how it behaves in a real install — so the
 * link is what makes this test exercise the real resolution path rather than a
 * stubbed one.
 */
beforeEach(() => {
	project = mkdtempSync(join(tmpdir(), "nebula-add-"));
	mkdirSync(join(project, "node_modules", "@c9up"), { recursive: true });
	writeFileSync(
		join(project, "package.json"),
		'{"name":"probe","type":"module"}',
	);
	// An absolute symlink, the way a workspace install links a local package —
	// so `require.resolve` reaches the real root with its `src/` and registry,
	// and the test exercises the resolution path a real install uses.
	symlinkSync(
		packageRoot,
		join(project, "node_modules", "@c9up", "nebula"),
		"dir",
	);
});

afterEach(() => {
	rmSync(project, { recursive: true, force: true });
});

describe("nebula add", () => {
	it("copies runnable JavaScript by default", () => {
		// An Aurora app serves `resources/pages` to the browser unbuilt, so
		// TypeScript dropped there does not run at all. This is the case the
		// registry exists to serve.
		const result = add({ cwd: project, names: ["button"] });
		expect(result.language).toBe("js");

		const button = join(project, "resources/pages/atoms/Button.js");
		expect(existsSync(button)).toBe(true);
		expect(existsSync(join(project, "resources/pages/atoms/Button.ts"))).toBe(
			false,
		);
	});

	it("keeps the doc comments in the compiled copy", () => {
		// The point of owning the source is being able to read and edit it; a
		// stripped bundle would hand over something nobody wants to touch.
		add({ cwd: project, names: ["button"] });
		const button = readFileSync(
			join(project, "resources/pages/atoms/Button.js"),
			"utf8",
		);
		expect(button).toContain("the reference component for the whole library");
	});

	it("mirrors the package layout so no import needs rewriting", () => {
		add({ cwd: project, names: ["button"], language: "ts" });

		const button = join(project, "resources/pages/atoms/Button.ts");
		expect(existsSync(button)).toBe(true);
		// Button imports `../lib/cva.js`; the copy resolves only because the
		// shape was preserved.
		expect(existsSync(join(project, "resources/pages/lib/cva.ts"))).toBe(true);
		expect(readFileSync(button, "utf8")).toContain('from "../lib/cva.js"');
	});

	it("emits import specifiers a browser can follow", () => {
		add({ cwd: project, names: ["button"] });
		const button = readFileSync(
			join(project, "resources/pages/atoms/Button.js"),
			"utf8",
		);
		expect(button).toContain('from "../lib/cva.js"');
		expect(button).toContain('from "@c9up/aurora"');
	});

	it("pulls in the components a component depends on", () => {
		add({ cwd: project, names: ["combobox"] });
		expect(
			existsSync(join(project, "resources/pages/organisms/Command.js")),
		).toBe(true);
		expect(
			existsSync(join(project, "resources/pages/organisms/Select.js")),
		).toBe(true);
	});

	it("copies a shared file once and does not report it as pre-existing", () => {
		// Both pull in `lib/cn.js`. Reporting the second visit as "exists" would
		// look like a warning about the user's own edits.
		const result = add({ cwd: project, names: ["button", "badge"] });
		expect(result.skipped).toEqual([]);
		expect(result.written.filter((file) => file === "lib/cn.js")).toHaveLength(
			1,
		);
	});

	it("never overwrites an edited file without --force", () => {
		add({ cwd: project, names: ["button"] });
		const button = join(project, "resources/pages/atoms/Button.js");
		writeFileSync(button, "// my version\n");

		const second = add({ cwd: project, names: ["button"] });
		expect(second.skipped).toContain("atoms/Button.js");
		expect(readFileSync(button, "utf8")).toBe("// my version\n");
	});

	it("overwrites when asked", () => {
		add({ cwd: project, names: ["button"] });
		const button = join(project, "resources/pages/atoms/Button.js");
		writeFileSync(button, "// my version\n");

		add({ cwd: project, names: ["button"], force: true });
		expect(readFileSync(button, "utf8")).toContain("buttonVariants");
	});

	it("writes nothing on a dry run", () => {
		const result = add({ cwd: project, names: ["button"], dryRun: true });
		expect(result.written.length).toBeGreaterThan(0);
		expect(existsSync(join(project, "resources/pages/atoms/Button.js"))).toBe(
			false,
		);
	});

	it("honours a custom component root", () => {
		add({ cwd: project, names: ["badge"], paths: { components: "app/ui" } });
		expect(existsSync(join(project, "app/ui/atoms/Badge.js"))).toBe(true);
	});

	it("refuses an unknown name with a usable message", () => {
		expect(() => add({ cwd: project, names: ["nope"] })).toThrow(
			/unknown component "nope"/,
		);
	});

	it("follows the language the project already writes in", () => {
		// Read from disk rather than configured: the answer is sitting there,
		// and a mismatched setting produces files the project cannot load.
		add({ cwd: project, names: ["badge"], language: "ts" });
		const second = add({ cwd: project, names: ["button"] });
		expect(second.language).toBe("ts");
		expect(existsSync(join(project, "resources/pages/atoms/Button.ts"))).toBe(
			true,
		);
	});

	it("lets the flag beat the detection", () => {
		add({ cwd: project, names: ["badge"], language: "ts" });
		const second = add({ cwd: project, names: ["button"], language: "js" });
		expect(second.language).toBe("js");
	});
});

describe("detectLanguage", () => {
	it("says nothing about a directory that does not exist", () => {
		expect(detectLanguage(join(project, "nope"))).toBeUndefined();
	});

	it("reads TypeScript from a tree holding any .ts", () => {
		const dir = join(project, "ui", "atoms");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "Thing.ts"), "");
		expect(detectLanguage(join(project, "ui"))).toBe("ts");
	});

	it("reads JavaScript from a tree of .js — the unbuilt Aurora shape", () => {
		const dir = join(project, "ui", "atoms");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "Thing.js"), "");
		expect(detectLanguage(join(project, "ui"))).toBe("js");
	});

	it("is not fooled by type declarations sitting beside compiled output", () => {
		const dir = join(project, "ui");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "Thing.js"), "");
		writeFileSync(join(dir, "Thing.d.ts"), "");
		expect(detectLanguage(dir)).toBe("js");
	});

	it("says nothing about a directory with neither", () => {
		const dir = join(project, "ui");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "README.md"), "");
		expect(detectLanguage(dir)).toBeUndefined();
	});
});
