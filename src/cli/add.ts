/**
 * `nebula add <component…>` — copy component sources into the project.
 *
 * The point of the registry model: what lands in the project is the source,
 * and from then on it is the user's. No version, no upgrade path, no wrapper
 * to fight when a design needs one class changed.
 *
 * Copies mirror the package's own layout, so `../lib/cn.js` resolves in the
 * project exactly as it does here and no import is ever rewritten. Rewriting
 * is where a copy-the-source CLI accumulates its edge cases; preserving the
 * shape means there are none.
 *
 * Existing files are never overwritten without `--force`. The whole premise is
 * that the user edits these, and a second `nebula add button` after a week of
 * changes must not silently discard them.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultPaths, type Language, type NebulaPaths } from "../config.js";
import { hashOf, writeManifest } from "./manifest.js";
import { loadRegistry, packageRoot, resolveItems } from "./registry.js";

export interface AddOptions {
	cwd: string;
	names: readonly string[];
	paths?: Partial<NebulaPaths>;
	/** Overrides both the detected language and the configured one. */
	language?: Language;
	force?: boolean;
	/** Print what would happen and write nothing. */
	dryRun?: boolean;
}

export interface AddResult {
	written: string[];
	skipped: string[];
	/** What was actually copied, so the caller can report it. */
	language: Language;
}

/**
 * Which language the project's component tree is written in.
 *
 * Read from what is already there rather than configured, because the answer
 * is sitting on disk and a mismatched setting produces files the project
 * cannot load. A tree holding `.ts` gets TypeScript; anything else — including
 * a tree of `.js`, which is what an unbuilt Aurora app has — gets JavaScript.
 * `undefined` when the directory does not exist yet.
 */
export function detectLanguage(componentsRoot: string): Language | undefined {
	if (!existsSync(componentsRoot)) return undefined;

	const stack = [componentsRoot];
	let sawJs = false;
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) continue;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === "node_modules") continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
				continue;
			}
			if (entry.name.endsWith(".d.ts")) continue;
			if (entry.name.endsWith(".ts")) return "ts";
			if (entry.name.endsWith(".js")) sawJs = true;
		}
	}
	return sawJs ? "js" : undefined;
}

export function add(options: AddOptions): AddResult {
	const root = packageRoot(join(options.cwd, "package.json"));
	const registry = loadRegistry(join(root, "registry.json"));
	const items = resolveItems(registry, options.names);

	const target = join(
		options.cwd,
		options.paths?.components ?? defaultPaths.components,
	);
	const language = options.language ?? detectLanguage(target) ?? "js";

	// The compiled output is what a browser can load. It ships in the package
	// and `prepublishOnly` rebuilds it, so an installed copy always has it;
	// inside this workspace it needs `pnpm build` first.
	const sourceRoot = join(root, language === "ts" ? "src" : "dist");
	if (!existsSync(sourceRoot)) {
		throw new Error(
			`${sourceRoot} is missing — run \`pnpm build\` in the nebula package before adding in ${language} mode.`,
		);
	}

	const written: string[] = [];
	const skipped: string[] = [];
	// What each file looked like when it was copied. `nebula diff` reads this
	// to tell a change you made from one released upstream that you have not
	// seen — without it every edited component reads as "differs", which is
	// true of all of them by design.
	const copiedHashes: Record<string, string> = {};
	// Shared files — `lib/cn.ts`, the primitives — belong to several items, so
	// one run reaches the same path repeatedly. Without this, the second visit
	// finds the file the first visit just wrote and reports it as pre-existing,
	// which reads as a warning about the user's own work.
	const handled = new Set<string>();

	for (const item of items) {
		for (const file of item.files) {
			if (handled.has(file)) continue;
			handled.add(file);

			// The registry lists `.ts` paths; the compiled tree mirrors it exactly,
			// so only the extension changes.
			const relative = language === "ts" ? file : file.replace(/\.ts$/, ".js");
			const from = join(sourceRoot, relative);
			const to = join(target, relative);

			if (existsSync(to) && options.force !== true) {
				skipped.push(relative);
				continue;
			}
			written.push(relative);
			if (options.dryRun === true) continue;

			mkdirSync(dirname(to), { recursive: true });
			copyFileSync(from, to);
			const hash = hashOf(to);
			if (hash !== undefined) copiedHashes[relative] = hash;
		}
	}

	if (options.dryRun !== true && Object.keys(copiedHashes).length > 0) {
		writeManifest(target, copiedHashes);
	}

	return { written, skipped, language };
}
