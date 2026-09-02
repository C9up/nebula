/**
 * `nebula diff` — which copied components no longer match the package.
 *
 * The counterpart to `add`. Copying is one-way by design, so a fix released
 * upstream never reaches a project on its own and nothing anywhere says so:
 * not the lockfile, not `pnpm update`, not the file itself. This is the report
 * that makes that visible.
 *
 * It answers with the *reason* a file differs, not just that it does. Every
 * copied component is expected to diverge from upstream eventually — that is
 * what owning the source means — so "differs" alone would flag the whole tree
 * and mean nothing. The hash recorded at copy time is what separates a change
 * you made from one you have not seen yet.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { defaultPaths, type Language, type NebulaPaths } from "../config.js";
import { detectLanguage } from "./add.js";
import { hashOf, readManifest } from "./manifest.js";
import { loadRegistry, packageRoot } from "./registry.js";

export type DiffState =
	/** Copy, record and package all agree. */
	| "same"
	/** The package moved and the copy is untouched — a re-copy loses nothing. */
	| "outdated"
	/** The copy was edited; the package has not moved. */
	| "edited"
	/** Both moved. The only state that needs a decision. */
	| "conflict"
	/** Copied before anything was recorded, and it no longer matches. */
	| "unknown";

export interface DiffEntry {
	/** Path as the registry names it, relative to the components root. */
	file: string;
	state: DiffState;
}

export interface DiffOptions {
	cwd: string;
	paths?: Partial<NebulaPaths>;
	language?: Language;
}

export interface DiffResult {
	entries: DiffEntry[];
	language: Language;
}

/**
 * Compare every copied component against the installed package.
 *
 * Only files that are actually in the project are considered — the registry
 * lists everything nebula ships, and a component nobody copied is not news.
 */
export function diff(options: DiffOptions): DiffResult {
	const paths = { ...defaultPaths, ...options.paths };
	const target = join(options.cwd, paths.components);
	const language = options.language ?? detectLanguage(target) ?? "js";

	const root = packageRoot(join(options.cwd, "package.json"));
	const sourceRoot = join(root, language === "ts" ? "src" : "dist");
	const registry = loadRegistry(join(root, "registry.json"));
	const manifest = readManifest(target);

	const entries: DiffEntry[] = [];
	const seen = new Set<string>();

	for (const item of registry.items) {
		for (const file of item.files) {
			// The registry names `.ts` paths; the compiled tree mirrors it exactly.
			const relative = language === "ts" ? file : file.replace(/\.ts$/, ".js");
			if (seen.has(relative)) continue;
			seen.add(relative);

			const copied = join(target, relative);
			if (!existsSync(copied)) continue;

			const state = compare({
				copy: hashOf(copied),
				source: hashOf(join(sourceRoot, relative)),
				recorded: manifest.files[relative],
			});
			if (state !== "same") entries.push({ file: relative, state });
		}
	}

	entries.sort((a, b) => a.file.localeCompare(b.file));
	return { entries, language };
}

function compare(hashes: {
	copy: string | undefined;
	source: string | undefined;
	recorded: string | undefined;
}): DiffState {
	const { copy, source, recorded } = hashes;
	// Nothing to compare against: the package no longer ships this file, so
	// whatever is in the project is now the only copy of it.
	if (source === undefined) return "same";
	if (copy === source) return "same";

	// Copied before the manifest existed. The two differ, and there is no way
	// to tell which side moved.
	if (recorded === undefined) return "unknown";

	const copyTouched = copy !== recorded;
	const sourceMoved = source !== recorded;
	if (copyTouched && sourceMoved) return "conflict";
	if (sourceMoved) return "outdated";
	return "edited";
}
