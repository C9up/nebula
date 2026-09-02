/**
 * The `configure()` hook — what `ream add @c9up/nebula` dispatches to.
 *
 * The house installs every package the same way, so this is nebula's whole
 * setup surface. The codemods object is injected by the Rust CLI at runtime;
 * here it is a recorder, which is all the hook actually needs.
 */

import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../../src/configure.js";

interface Written {
	path: string;
	content: string;
}

function recorder() {
	const files: Written[] = [];
	const commands: string[] = [];
	return {
		files,
		commands,
		codemods: {
			writeFile: async (path: string, content: string): Promise<void> => {
				files.push({ path, content });
			},
			registerCommand: async (importPath: string): Promise<void> => {
				commands.push(importPath);
			},
		},
	};
}

/** The hook narrates on stderr; keep it out of the test output. */
function silenceStderr(): string[] {
	const lines: string[] = [];
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		lines.push(String(chunk));
		return true;
	});
	return lines;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("configure", () => {
	it("defaults to the adapter shadcn itself targets", async () => {
		silenceStderr();
		const { files, codemods } = recorder();
		await configure(codemods);

		const config = files.find((file) => file.path === "config/nebula.ts");
		expect(config?.content).toContain("adapter: 'tailwind'");
	});

	it("writes the config and the adapter's stub, and nothing else", async () => {
		silenceStderr();
		const { files, codemods } = recorder();
		await configure(codemods, { adapter: ["tailwind"] });

		expect(files.map((file) => file.path)).toEqual([
			"config/nebula.ts",
			"resources/css/app.css",
		]);
	});

	it("takes the adapter from the forwarded flag", async () => {
		silenceStderr();
		const { files, codemods } = recorder();
		await configure(codemods, { adapter: ["unocss"] });

		expect(files.map((file) => file.path)).toContain("uno.config.ts");
		expect(files.find((f) => f.path === "config/nebula.ts")?.content).toContain(
			"adapter: 'unocss'",
		);
	});

	it("refuses a misspelled adapter rather than silently defaulting", async () => {
		// `--adapter tailwnid` would otherwise write a Tailwind setup and leave
		// the user hunting for the UnoCSS config that never appeared.
		silenceStderr();
		const { codemods } = recorder();
		await expect(
			configure(codemods, { adapter: ["tailwnid"] }),
		).rejects.toThrow(/unknown adapter "tailwnid"/);
	});

	it("tells the user what to install, and never installs it", async () => {
		const stderr = silenceStderr();
		const { codemods } = recorder();
		await configure(codemods, { adapter: ["tailwind"] });

		const output = stderr.join("");
		expect(output).toContain("Install the engine yourself");
		expect(output).toContain("tailwindcss");
	});

	it("prints the build command to register", async () => {
		const stderr = silenceStderr();
		const { codemods } = recorder();
		await configure(codemods, { adapter: ["unocss"] });
		expect(stderr.join("")).toContain("config/assets.ts");
	});

	it("says there is no build step for the engine-free adapter", async () => {
		const stderr = silenceStderr();
		const { codemods } = recorder();
		await configure(codemods, { adapter: ["css"] });

		const output = stderr.join("");
		expect(output).toContain("No build step");
		expect(output).not.toContain("Install the engine yourself");
	});

	it("points at the house command for adding components", async () => {
		const stderr = silenceStderr();
		const { codemods } = recorder();
		await configure(codemods);
		expect(stderr.join("")).toContain("ream nebula:add");
	});

	it("registers its commands on the channel Ream provides for packages", async () => {
		// `reamrc.commands` is what directory discovery cannot see. Going through
		// it is what keeps `ream nebula:add` out of the Rust binary — otherwise
		// every package wanting a command waits on a release of that binary.
		silenceStderr();
		const { commands, codemods } = recorder();
		await configure(codemods);

		expect(commands).toEqual([
			"@c9up/nebula/commands/add",
			"@c9up/nebula/commands/list",
		]);
	});
});

/**
 * The stylesheet is never overwritten — it is the app's. The failure that
 * caused is silent: components get copied in, every class name is present in
 * the markup, and the page renders grey because the tokens they resolve
 * against were never defined.
 */
describe("configure > a stylesheet that was left in place", () => {
	async function inProject(css: string | null): Promise<string> {
		const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "nebula-cfg-"));
		if (css !== null) {
			await fsp.mkdir(path.join(dir, "resources/css"), { recursive: true });
			await fsp.writeFile(path.join(dir, "resources/css/app.css"), css);
		}
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		const lines = silenceStderr();
		await configure(recorder().codemods, {});
		return lines.join("");
	}

	it("names the tokens the app's own stylesheet does not define", async () => {
		const out = await inProject(
			'@import "tailwindcss";\n@source "../pages";\n',
		);

		expect(out).toContain("already existed");
		expect(out).toContain("--color-primary");
	});

	it("says nothing when the app imports nebula's theme", async () => {
		const out = await inProject(
			'@import "tailwindcss";\n@import "@c9up/nebula/theme.css";\n',
		);

		expect(out).not.toContain("already existed");
	});

	// Declaring `--color-*` directly is the other correct way: no theme import,
	// no `@theme inline`, and every utility still resolves.
	it("says nothing when the app declares the tokens itself", async () => {
		const declared = [
			'@import "tailwindcss";',
			"@theme {",
			...[
				"background",
				"foreground",
				"card",
				"card-foreground",
				"popover",
				"popover-foreground",
				"primary",
				"primary-foreground",
				"secondary",
				"secondary-foreground",
				"muted",
				"muted-foreground",
				"accent",
				"accent-foreground",
				"destructive",
				"destructive-foreground",
				"border",
				"input",
				"ring",
				"sidebar",
				"sidebar-foreground",
				"sidebar-primary",
				"sidebar-primary-foreground",
				"sidebar-accent",
				"sidebar-accent-foreground",
				"sidebar-border",
				"sidebar-ring",
				"chart-1",
				"chart-2",
				"chart-3",
				"chart-4",
				"chart-5",
			].map((name) => `  --color-${name}: oklch(0.5 0 0);`),
			"}",
		].join("\n");

		const out = await inProject(declared);

		expect(out).not.toContain("already existed");
	});

	it("says nothing when there was no stylesheet to skip", async () => {
		const out = await inProject(null);

		expect(out).not.toContain("already existed");
	});
});
