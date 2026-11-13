/**
 * `nebula diff` — telling a change you made from one you have not seen.
 *
 * The registry model copies the source and steps back, so a fix released
 * upstream never reaches a project on its own and nothing reports it. The
 * report is only useful if it separates the two reasons a file can differ:
 * every copied component is expected to diverge eventually, so "differs" alone
 * would flag the whole tree and mean nothing.
 */

import {
	appendFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { add } from "../../src/cli/add.js";
import { diff } from "../../src/cli/diff.js";
import {
	hashOf,
	MANIFEST_FILE,
	readManifest,
	writeManifest,
} from "../../src/cli/manifest.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COMPONENTS = "resources/pages";
const BUTTON = "atoms/Button.ts";

let project: string;

beforeEach(() => {
	project = mkdtempSync(join(tmpdir(), "nebula-diff-"));
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
	add({ cwd: project, names: ["button"], language: "ts" });
});

afterEach(() => {
	rmSync(project, { recursive: true, force: true });
});

function stateOf(file: string): string | undefined {
	return diff({ cwd: project, language: "ts" }).entries.find(
		(entry) => entry.file === file,
	)?.state;
}

const copied = (): string => join(project, COMPONENTS, BUTTON);

describe("nebula diff", () => {
	it("says nothing about a fresh copy", () => {
		expect(diff({ cwd: project, language: "ts" }).entries).toEqual([]);
	});

	it("records what it copied, so there is something to compare against", () => {
		const manifest = readManifest(join(project, COMPONENTS));

		expect(manifest.files[BUTTON]).toBe(hashOf(copied()));
	});

	// The expected state of most of the tree, and the one that must stay quiet:
	// owning the source is the point.
	it("reports a file you edited as edited, not as out of date", () => {
		appendFileSync(copied(), "\n// mine\n");

		expect(stateOf(BUTTON)).toBe("edited");
	});

	/**
	 * The case the command exists for: the package moved, the copy did not.
	 *
	 * Simulated from the record rather than by editing the installed package.
	 * Moving the copy and re-recording it as copied is, to the comparison, that
	 * exact situation: the copy agrees with its own record and the source no
	 * longer does. Which of the two bytes moved is not something it can see.
	 */
	it("reports an untouched copy as outdated once the package moves", () => {
		appendFileSync(copied(), "\n// released upstream\n");
		const asCopied = hashOf(copied());
		if (asCopied === undefined) throw new Error("the copy went missing");
		writeManifest(join(project, COMPONENTS), { [BUTTON]: asCopied });

		expect(stateOf(BUTTON)).toBe("outdated");
	});

	it("reports both sides moving as a conflict", () => {
		appendFileSync(copied(), "\n// mine\n");
		writeManifest(join(project, COMPONENTS), { [BUTTON]: "0".repeat(64) });

		expect(stateOf(BUTTON)).toBe("conflict");
	});

	// Every project that copied components before this existed lands here.
	it("admits it cannot tell when nothing was recorded", () => {
		appendFileSync(copied(), "\n// mine\n");
		rmSync(join(project, COMPONENTS, MANIFEST_FILE));

		expect(stateOf(BUTTON)).toBe("unknown");
	});
});

describe("nebula diff > the update it suggests", () => {
	beforeEach(() => {
		add({ cwd: project, names: ["select", "dropdown-menu"], language: "ts" });
	});

	const at = (file: string): string => join(project, COMPONENTS, file);

	/** The package moved past the copy, as in the case above. */
	function outdate(file: string): void {
		appendFileSync(at(file), "\n// released upstream\n");
		const asCopied = hashOf(at(file));
		if (asCopied === undefined) throw new Error(`${file} went missing`);
		writeManifest(join(project, COMPONENTS), { [file]: asCopied });
	}

	function edit(file: string): void {
		appendFileSync(at(file), "\n// mine\n");
	}

	const plan = () => diff({ cwd: project, language: "ts" }).update;

	it("names the component that carries a shared file, never the file", () => {
		// `primitives/menu.ts` has no registry name; among what is installed,
		// only dropdown-menu carries it.
		outdate("primitives/menu.ts");

		expect(plan()).toEqual({ components: ["dropdown-menu"], uncovered: [] });
	});

	it("suggests a command nebula:add runs as is, and that leaves nothing outdated", () => {
		outdate("primitives/menu.ts");
		outdate("lib/icons.ts");
		outdate("atoms/Button.ts");
		const { components } = plan();

		// The ticket's failure: `nebula:add` stopped at the first name it did
		// not know. Every suggested name must be one it accepts.
		add({ cwd: project, names: components, language: "ts", force: true });

		const left = diff({ cwd: project, language: "ts" }).entries.filter(
			(entry) => entry.state === "outdated",
		);
		expect(left).toEqual([]);
	});

	it("keeps the command short: a shared file rides along with a component already listed", () => {
		outdate("primitives/menu.ts");
		outdate("lib/icons.ts");

		// dropdown-menu carries both; select would be redundant.
		expect(plan().components).toEqual(["dropdown-menu"]);
	});

	it("names a component whose own file moved", () => {
		outdate("atoms/Button.ts");
		outdate("lib/icons.ts");

		expect(plan().components).toEqual(["button", "dropdown-menu"]);
	});

	it("never suggests a component whose copy would overwrite a file you edited", () => {
		outdate("lib/icons.ts");
		edit("organisms/DropdownMenu.ts");

		expect(plan()).toEqual({ components: ["select"], uncovered: [] });
	});

	it("lists the outdated file apart when every component carrying it was edited", () => {
		outdate("lib/icons.ts");
		edit("organisms/DropdownMenu.ts");
		edit("organisms/Select.ts");

		expect(plan()).toEqual({ components: [], uncovered: ["lib/icons.ts"] });
	});

	it("does not count a component as installed once its own file is gone", () => {
		outdate("primitives/menu.ts");
		rmSync(at("organisms/DropdownMenu.ts"));

		expect(plan()).toEqual({
			components: [],
			uncovered: ["primitives/menu.ts"],
		});
	});
});
