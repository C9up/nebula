/**
 * The `configure()` hook — what `ream add @c9up/nebula` dispatches to.
 *
 * The house installs every package the same way, so this is nebula's whole
 * setup surface. The codemods object is injected by the Rust CLI at runtime;
 * here it is a recorder, which is all the hook actually needs.
 */

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
