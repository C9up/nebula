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

import { adapterFor, isAdapterName } from "./adapters/index.js";
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

	for (const file of adapter.files(config)) {
		await codemods.writeFile(file.path, file.contents);
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
		"",
	);
	process.stderr.write(lines.join("\n"));
}
