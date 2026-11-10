/**
 * `ream nebula:add` and `nebula:diff` follow `config/nebula.ts`.
 *
 * As shadcn's CLI reads `components.json` on every `add` and `diff`: the
 * configured components path is where files go and where they are compared,
 * and the configured language applies when the tree says nothing. The
 * `--ts` / `--js` flags and what the tree already holds still come first.
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddCommand from "../../src/console/AddCommand.js";
import DiffCommand from "../../src/console/DiffCommand.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let project: string;
let previousCwd: string;

/**
 * Under the package's ignored `coverage/` rather than the system temp
 * directory: the test runner will not import a module from a path with a
 * hidden directory in it, which a `~/.tmp` temp directory has. Node does.
 */
const scratch = join(packageRoot, "coverage", "console-config");

beforeEach(() => {
	mkdirSync(scratch, { recursive: true });
	project = mkdtempSync(join(scratch, "app-"));
	mkdirSync(join(project, "node_modules", "@c9up"), { recursive: true });
	mkdirSync(join(project, "config"));
	writeFileSync(
		join(project, "package.json"),
		'{"name":"probe","type":"module"}',
	);
	symlinkSync(
		packageRoot,
		join(project, "node_modules", "@c9up", "nebula"),
		"dir",
	);
	previousCwd = process.cwd();
	process.chdir(project);
});

afterEach(() => {
	process.chdir(previousCwd);
	rmSync(project, { recursive: true, force: true });
	process.exitCode = undefined;
	vi.restoreAllMocks();
});

function configure(source: string, file = "nebula.ts"): void {
	writeFileSync(join(project, "config", file), source);
}

function capture(): () => string {
	let out = "";
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		out += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		out += String(chunk);
		return true;
	});
	return () => out;
}

async function add(
	names: string[],
	flags: { ts?: boolean; js?: boolean } = {},
) {
	const command = new AddCommand();
	command.components = names;
	command.ts = flags.ts ?? false;
	command.js = flags.js ?? false;
	await command.run();
}

describe("nebula:add > config/nebula.ts", () => {
	it("copies under the configured components path", async () => {
		configure(
			"export default { adapter: 'tailwind', paths: { components: 'resources/ui' } }\n",
		);
		capture();
		await add(["badge"]);
		expect(existsSync(join(project, "resources/ui/atoms"))).toBe(true);
		expect(existsSync(join(project, "resources/pages"))).toBe(false);
	});

	it("copies TypeScript when the config says so and the tree is empty", async () => {
		configure("export default { adapter: 'tailwind', language: 'ts' }\n");
		const out = capture();
		await add(["badge"]);
		expect(existsSync(join(project, "resources/pages/atoms/Badge.ts"))).toBe(
			true,
		);
		expect(out()).toContain("Copied as TypeScript");
	});

	it("reads a config written in JavaScript", async () => {
		configure(
			"export default { adapter: 'css', paths: { components: 'app/ui' } }\n",
			"nebula.js",
		);
		capture();
		await add(["badge"]);
		expect(existsSync(join(project, "app/ui/atoms"))).toBe(true);
	});

	it("lets the flag win over the configured language", async () => {
		configure("export default { adapter: 'tailwind', language: 'ts' }\n");
		capture();
		await add(["badge"], { js: true });
		expect(existsSync(join(project, "resources/pages/atoms/Badge.js"))).toBe(
			true,
		);
	});

	it("refuses a config whose language is neither ts nor js, naming the file", async () => {
		configure("export default { adapter: 'tailwind', language: 'rust' }\n");
		capture();
		await expect(add(["badge"])).rejects.toThrow(/config\/nebula\.ts/);
		expect(existsSync(join(project, "resources"))).toBe(false);
	});
});

describe("nebula:diff > config/nebula.ts", () => {
	it("compares the copies under the configured components path", async () => {
		configure(
			"export default { adapter: 'tailwind', language: 'ts', paths: { components: 'resources/ui' } }\n",
		);
		const out = capture();
		await add(["badge"]);
		appendFileSync(
			join(project, "resources/ui/atoms/Badge.ts"),
			"\n// local change\n",
		);
		await new DiffCommand().run();
		expect(out()).toMatch(/edited\s+atoms\/Badge\.ts/);
	});
});
