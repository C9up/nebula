/**
 * `ream configure @c9up/nebula` — the house setup hook.
 *
 * Every package in this workspace is installed the same way: `ream add <pkg>`
 * installs it and dispatches to this hook, which writes the files the package
 * needs through the codemods the CLI hands in. nebula follows that rather than
 * shipping a setup command of its own — one way to install a ream package, not
 * one per package.
 *
 * Pass the adapter through the installer:
 *
 *     ream add @c9up/nebula --adapter unocss
 *
 * There is no provider to register. A provider binds runtime services into the
 * container, and nebula has none: its components are client-side templates and
 * its adapters run at build time. An empty provider would be ceremony.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adapterFor, isAdapterName } from "./adapters/index.js";
import type { GeneratedFile } from "./adapters/types.js";
import { type AdapterName, resolveConfig } from "./config.js";

/**
 * The subset of the CLI's codemods this hook uses.
 *
 * Declared structurally rather than imported: `@c9up/ream-cli` is a Rust
 * binary that injects this object at runtime, so there is no type to import
 * and a dependency on the CLI would be a lie. Same shape the other packages'
 * hooks declare.
 */
interface Codemods {
	writeFile(
		filePath: string,
		content: string,
		options?: { force?: boolean },
	): Promise<void>;
	/** Appends to `reamrc.commands` — the channel for package-shipped commands. */
	registerCommand(importPath: string): Promise<void>;
}

/** Flags forwarded from `ream add` / `ream configure`, as the CLI encodes them. */
type Flags = Record<string, string[] | undefined>;

function configFile(adapter: AdapterName): string {
	return `import { defineConfig } from '@c9up/nebula'

/**
 * nebula — component registry and style adapter.
 *
 * Changing \`adapter\` and re-running \`ream configure @c9up/nebula\` swaps the
 * CSS engine. The components themselves are untouched: all three adapters
 * consume the same class names.
 */
export default defineConfig({
  adapter: '${adapter}',
  paths: {
    // Where \`ream nebula:add\` copies components. The atomic layers live under it.
    components: 'resources/pages',
    css: 'resources/css/app.css',
    output: 'public/app.css',
  },
})
`;
}

/**
 * Read the adapter from the forwarded flags.
 *
 * An unrecognised name is refused rather than silently defaulted: a typo in
 * `--adapter tailwnid` would otherwise write a Tailwind setup and leave the
 * user hunting for why their UnoCSS config never appeared.
 */
function adapterFrom(flags: Flags): AdapterName {
	const requested = flags.adapter?.[0];
	if (requested === undefined) return "tailwind";
	if (!isAdapterName(requested)) {
		throw new Error(
			`[@c9up/nebula] unknown adapter "${requested}" — one of tailwind, unocss, css`,
		);
	}
	return requested;
}

export async function configure(
	codemods: Codemods,
	flags: Flags = {},
): Promise<void> {
	const name = adapterFrom(flags);
	const adapter = adapterFor(name);
	const config = resolveConfig({ adapter: name });

	await codemods.writeFile("config/nebula.ts", configFile(name));

	// `reamrc.commands` is the channel Ream provides for commands a package
	// ships, which directory discovery cannot see. `ream` forwards any
	// unrecognised name to the app's console kernel, so these exist without a
	// line of Rust and without waiting on a release of the binary.
	await codemods.registerCommand("@c9up/nebula/commands/add");
	await codemods.registerCommand("@c9up/nebula/commands/list");
	await codemods.registerCommand("@c9up/nebula/commands/diff");

	const generated = adapter.files(config);
	for (const file of generated) {
		// `skipIfExists` is the adapter saying the app owns this file. Pass it
		// through rather than relying on the codemod's default, so the contract
		// is the thing that decides.
		await codemods.writeFile(file.path, file.contents, {
			force: !file.skipIfExists,
		});
	}

	const gaps: Array<{ path: string; missing: string[] }> = [];
	for (const file of generated) {
		if (!file.skipIfExists) continue;
		const missing = await missingFrom(file);
		if (missing.length > 0) gaps.push({ path: file.path, missing });
	}

	// On stderr, and never installed on the user's behalf. nebula declares no
	// CSS dependency at all — the app owns its build tooling, and a UI library
	// quietly adding one to someone's dependency tree is how a tree gets away
	// from them.
	const lines = ["", `[@c9up/nebula] configured with the ${name} adapter.`];

	if (adapter.packages.length > 0) {
		lines.push(
			"  Install the engine yourself:",
			`    pnpm add -D ${adapter.packages.join(" ")}`,
		);
	}

	const commands = adapter.commands(config);
	if (commands === null) {
		lines.push("  No build step — the stylesheet ships prebuilt.");
	} else {
		lines.push(
			"  Register the build in config/assets.ts:",
			`    build:     ${commands.build.command} ${commands.build.args.join(" ")}`,
			`    devServer: ${commands.dev.command} ${commands.dev.args.join(" ")}`,
		);
	}

	lines.push(
		"  Then add components with `ream nebula:add button card` — they are copied",
		"  into your project and are yours to edit.",
	);

	for (const gap of gaps) {
		lines.push(
			"",
			`  ${gap.path} already existed, so it was left alone — it is yours.`,
			"  The components resolve against tokens it does not define:",
			...gap.missing.map((token) => `      ${token}`),
			"",
			'  Import nebula\'s theme (`@import "@c9up/nebula/theme.css"` plus the',
			"  `@theme inline` block), or declare them yourself. Without them the",
			"  utilities still compile and every colour resolves to nothing.",
		);
	}

	lines.push("");
	process.stderr.write(lines.join("\n"));
}

/**
 * Which of the tokens the components resolve against are absent from the
 * stylesheet that was left in place.
 *
 * `skipIfExists` means an app's own stylesheet is never overwritten, which is
 * right — it is theirs once it exists. The cost is that a project that already
 * had one gets the components copied in and nothing for them to resolve
 * against. Nothing throws, every class name is present in the markup, and the
 * page comes out grey.
 *
 * Tokens rather than directives, because there is more than one correct way to
 * supply them: importing nebula's theme, or declaring `--color-*` directly in
 * an `@theme` block. Only the second half of that is checkable by reading, so
 * the import short-circuits the question.
 */
async function missingFrom(file: GeneratedFile): Promise<string[]> {
	let existing: string;
	try {
		existing = await readFile(resolve(process.cwd(), file.path), "utf8");
	} catch {
		// No file to read means nothing was skipped: it was written as generated.
		return [];
	}
	if (existing.includes("@c9up/nebula/theme.css")) return [];
	return colorTokensOf(file.contents).filter(
		(token) => !new RegExp(`${token}\\s*:`).test(existing),
	);
}

/** The `--color-*` names a generated stylesheet makes available. */
function colorTokensOf(css: string): string[] {
	const found = new Set<string>();
	for (const match of css.matchAll(/(--color-[a-z-]+)\s*:/g)) {
		const name = match[1];
		if (name !== undefined) found.add(name);
	}
	return [...found];
}
