/**
 * The two command classes registered through `reamrc.commands`.
 *
 * They are plain classes the console kernel instantiates, sets properties on
 * from parsed argv, and calls `run()` against — so a test can do the same
 * without a kernel.
 */

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddCommand from "../../src/console/AddCommand.js";
import ListCommand from "../../src/console/ListCommand.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let project: string;
let previousCwd: string;

beforeEach(() => {
	project = mkdtempSync(join(tmpdir(), "nebula-console-"));
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

	// The commands read `process.cwd()`, which is the app root when the kernel
	// runs them.
	previousCwd = process.cwd();
	process.chdir(project);
});

afterEach(() => {
	process.chdir(previousCwd);
	rmSync(project, { recursive: true, force: true });
	process.exitCode = undefined;
	vi.restoreAllMocks();
});

function capture(): { out: () => string; err: () => string } {
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
	return { out: () => out, err: () => err };
}

describe("the command contract", () => {
	it("names both commands under the package's own prefix", () => {
		expect(AddCommand.commandName).toBe("nebula:add");
		expect(ListCommand.commandName).toBe("nebula:list");
	});

	it("describes itself, which is what `ream list` prints", () => {
		expect(AddCommand.description.length).toBeGreaterThan(0);
		expect(ListCommand.description.length).toBeGreaterThan(0);
	});

	it("does not boot the application — it only touches files", () => {
		expect(AddCommand.options.startApp).toBe(false);
		expect(ListCommand.options.startApp).toBe(false);
	});

	it("takes component names as a spread argument", () => {
		const arg = AddCommand.args[0];
		expect(arg?.type).toBe("spread");
		expect(arg?.propertyName).toBe("components");
	});

	it("dash-cases a camelCase flag, as the framework's decorators do", () => {
		const dryRun = AddCommand.flags.find((f) => f.propertyName === "dryRun");
		expect(dryRun?.flagName).toBe("dry-run");
	});
});

describe("nebula:add", () => {
	it("copies the named component and what it depends on", async () => {
		const output = capture();
		const command = new AddCommand();
		command.components = ["button"];
		await command.run();

		expect(existsSync(join(project, "resources/pages/atoms/Button.js"))).toBe(
			true,
		);
		expect(output.out()).toContain("atoms/Button.js");
		expect(process.exitCode).toBeUndefined();
	});

	it("asks for a name rather than guessing, and fails", async () => {
		const output = capture();
		const command = new AddCommand();
		await command.run();

		expect(output.err()).toContain("Name at least one component");
		expect(process.exitCode).toBe(1);
	});

	it("writes nothing on a dry run", async () => {
		capture();
		const command = new AddCommand();
		command.components = ["badge"];
		command.dryRun = true;
		await command.run();

		expect(existsSync(join(project, "resources/pages/atoms/Badge.js"))).toBe(
			false,
		);
	});

	it("honours --ts over the detected language", async () => {
		const output = capture();
		const command = new AddCommand();
		command.components = ["badge"];
		command.ts = true;
		await command.run();

		expect(existsSync(join(project, "resources/pages/atoms/Badge.ts"))).toBe(
			true,
		);
		expect(output.out()).toContain("Copied as TypeScript");
	});

	it("leaves an edited copy alone and says how to override", async () => {
		capture();
		const first = new AddCommand();
		first.components = ["badge"];
		await first.run();
		writeFileSync(join(project, "resources/pages/atoms/Badge.js"), "// mine\n");

		const output = capture();
		const second = new AddCommand();
		second.components = ["badge"];
		await second.run();
		expect(output.out()).toContain("--force");
	});
});

describe("nebula:list", () => {
	it("prints every layer with its components", async () => {
		const output = capture();
		await new ListCommand().run();

		const text = output.out();
		for (const layer of ["atoms", "molecules", "organisms", "templates"]) {
			expect(text).toContain(layer);
		}
		expect(text).toContain("button");
	});

	it("restricts to one layer", async () => {
		const output = capture();
		const command = new ListCommand();
		command.layer = "templates";
		await command.run();

		const text = output.out();
		expect(text).toContain("app-shell");
		expect(text).not.toContain("button");
	});

	it("refuses an unknown layer rather than printing nothing", async () => {
		// A typo would otherwise produce empty output, which reads as "the
		// registry is empty".
		const output = capture();
		const command = new ListCommand();
		command.layer = "atmos";
		await command.run();

		expect(output.err()).toContain('Unknown layer "atmos"');
		expect(process.exitCode).toBe(1);
	});
});
