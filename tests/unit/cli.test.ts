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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "../../src/cli/init.js";
import { main } from "../../src/cli/main.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let project: string;

beforeEach(() => {
	project = mkdtempSync(join(tmpdir(), "nebula-cli-"));
	mkdirSync(join(project, "node_modules", "@c9up"), { recursive: true });
	writeFileSync(
		join(project, "package.json"),
		'{"name":"probe","type":"module"}',
	);
	symlinkSync(
		packageRoot,
		join(project, "node_modules", "@c9up", "nebula"),
		"dir",
	);
});

afterEach(() => {
	rmSync(project, { recursive: true, force: true });
	vi.restoreAllMocks();
});

const read = (path: string): string =>
	readFileSync(join(project, path), "utf8");

/** Capture what a command printed, without letting it reach the test output. */
function capture(run: () => number): {
	code: number;
	out: string;
	err: string;
} {
	let out = "";
	let err = "";
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		out += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		err += String(chunk);
		return true;
	});
	const code = run();
	return { code, out, err };
}

describe("nebula init", () => {
	it("writes the config naming the chosen adapter", () => {
		init({ cwd: project, adapter: "unocss" });
		expect(read("config/nebula.ts")).toContain("adapter: 'unocss'");
	});

	it("writes the tailwind stylesheet with a @source relative to itself", () => {
		// The silent failure this guards: a wrong path scans nothing, emits no
		// utilities, and the page renders unstyled with no error anywhere.
		init({ cwd: project, adapter: "tailwind" });
		const css = read("resources/css/app.css");
		expect(css).toContain('@import "tailwindcss"');
		expect(css).toContain('@source "../pages"');
		expect(css).toContain("@theme inline");
	});

	it("writes a uno config for the unocss adapter, and no stylesheet", () => {
		init({ cwd: project, adapter: "unocss" });
		expect(existsSync(join(project, "uno.config.ts"))).toBe(true);
		expect(read("uno.config.ts")).toContain("presetWind4");
		expect(existsSync(join(project, "resources/css/app.css"))).toBe(false);
	});

	it("imports the prebuilt sheet for the engine-free adapter", () => {
		init({ cwd: project, adapter: "css" });
		expect(read("resources/css/app.css")).toContain(
			'@import "@c9up/nebula/nebula.css"',
		);
	});

	it("reports the packages the app installs itself", () => {
		// nebula never installs them: a UI library adding a build tool to
		// someone's dependency tree is how a tree gets away from them.
		expect(init({ cwd: project, adapter: "tailwind" }).packages).toContain(
			"tailwindcss",
		);
		expect(init({ cwd: project, adapter: "css" }).packages).toEqual([]);
	});

	it("reports build and watch commands, and none for the css adapter", () => {
		const tailwind = init({ cwd: project, adapter: "tailwind" });
		expect(tailwind.commands?.dev.args).toContain("--watch");
		expect(init({ cwd: project, adapter: "css" }).commands).toBeNull();
	});

	it("leaves a config the user has edited alone", () => {
		init({ cwd: project, adapter: "tailwind" });
		writeFileSync(join(project, "config/nebula.ts"), "// mine\n");

		const second = init({ cwd: project, adapter: "tailwind" });
		expect(second.skipped).toContain("config/nebula.ts");
		expect(read("config/nebula.ts")).toBe("// mine\n");
	});

	it("overwrites when forced", () => {
		init({ cwd: project, adapter: "tailwind" });
		writeFileSync(join(project, "config/nebula.ts"), "// mine\n");
		init({ cwd: project, adapter: "tailwind", force: true });
		expect(read("config/nebula.ts")).toContain("defineConfig");
	});

	it("writes nothing on a dry run", () => {
		const result = init({ cwd: project, adapter: "tailwind", dryRun: true });
		expect(result.written.length).toBeGreaterThan(0);
		expect(existsSync(join(project, "config/nebula.ts"))).toBe(false);
	});
});

describe("nebula (argument parsing and commands)", () => {
	it("prints usage and succeeds for help", () => {
		const { code, out } = capture(() => main(["help"], project));
		expect(code).toBe(0);
		expect(out).toContain("nebula init");
		expect(out).toContain("nebula add");
	});

	it("fails on an unknown command, still showing usage", () => {
		const { code, out } = capture(() => main(["frobnicate"], project));
		expect(code).toBe(1);
		expect(out).toContain("nebula init");
	});

	it("lists the registry by layer", () => {
		const { code, out } = capture(() =>
			main(["list", "--layer", "atoms"], project),
		);
		expect(code).toBe(0);
		expect(out).toContain("atoms");
		expect(out).toContain("button");
		expect(out).not.toContain("\norganisms");
	});

	it("refuses an unknown adapter and names the valid ones", () => {
		const { code, err } = capture(() =>
			main(["init", "--adapter", "panda"], project),
		);
		expect(code).toBe(1);
		expect(err).toContain("unknown adapter");
		expect(err).toContain("tailwind");
	});

	it("initialises through the command line", () => {
		const { code, out } = capture(() =>
			main(["init", "--adapter", "css"], project),
		);
		expect(code).toBe(0);
		expect(out).toContain("config/nebula.ts");
		expect(out).toContain("No build step");
		expect(existsSync(join(project, "config/nebula.ts"))).toBe(true);
	});

	it("asks for a component name rather than guessing", () => {
		const { code, err } = capture(() => main(["add"], project));
		expect(code).toBe(1);
		expect(err).toContain("name at least one component");
	});

	it("adds a component and reports what it wrote", () => {
		const { code, out } = capture(() => main(["add", "button"], project));
		expect(code).toBe(0);
		expect(out).toContain("atoms/Button.ts");
		expect(existsSync(join(project, "resources/pages/atoms/Button.ts"))).toBe(
			true,
		);
	});

	it("turns an unknown component into a usable message, not a stack trace", () => {
		const { code, err } = capture(() => main(["add", "nope"], project));
		expect(code).toBe(1);
		expect(err).toContain('unknown component "nope"');
		expect(err).toContain("nebula list");
	});

	it("treats a bare flag as a flag, not as the next argument's value", () => {
		// `--dry-run add` must not swallow `add` as the flag's value.
		const { code, out } = capture(() =>
			main(["add", "badge", "--dry-run"], project),
		);
		expect(code).toBe(0);
		expect(out).toContain("atoms/Badge.ts");
		expect(existsSync(join(project, "resources/pages/atoms/Badge.ts"))).toBe(
			false,
		);
	});

	it("says existing files were left alone, and how to override", () => {
		capture(() => main(["add", "button"], project));
		const { out } = capture(() => main(["add", "button"], project));
		expect(out).toContain("exists");
		expect(out).toContain("--force");
	});
});
