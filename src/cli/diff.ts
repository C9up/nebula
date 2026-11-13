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
import {
	loadRegistry,
	packageRoot,
	type Registry,
	type RegistryItem,
	resolveItems,
} from "./registry.js";

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
	/** The configured language: used when the tree says nothing. */
	defaultLanguage?: Language;
}

/**
 * How to bring the outdated files up to date with `nebula:add --force`.
 *
 * `nebula:add` takes registry names, never file paths: a shared file such as
 * `lib/icons.ts` or `primitives/menu.ts` has no name of its own and travels
 * with the components that use it. So the outdated files are mapped back to
 * the installed components whose copy would bring them along.
 */
export interface UpdatePlan {
	/**
	 * Registry names to pass to `nebula:add --force`, sorted. Each one re-copies
	 * only files that are outdated or untouched — never one you edited, and
	 * never one whose history is unknown.
	 */
	components: string[];
	/**
	 * Outdated files none of those names can reach without overwriting a file
	 * you changed, or that no installed component carries any more.
	 */
	uncovered: string[];
}

export interface DiffResult {
	entries: DiffEntry[];
	language: Language;
	update: UpdatePlan;
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
	const language =
		options.language ??
		detectLanguage(target) ??
		options.defaultLanguage ??
		"js";

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
	const toCopy = (file: string): string =>
		language === "ts" ? file : file.replace(/\.ts$/, ".js");
	const update = planUpdate(registry, entries, {
		installed: (item) =>
			existsSync(join(target, toCopy(`${item.layer}/${item.title}.ts`))),
		toCopy,
	});
	return { entries, language, update };
}

export interface PlanOptions {
	/**
	 * Whether the project has this component. Its own file — the registry
	 * names an item after it — being in the tree is what says so.
	 */
	installed: (item: RegistryItem) => boolean;
	/** A registry path (`.ts`) as it is spelled in the copied tree. */
	toCopy: (file: string) => string;
}

/**
 * Pick the registry names that update the outdated files, losing nothing.
 *
 * A component qualifies when it is installed and everything `nebula:add
 * --force` would rewrite for it — its files and those of every component it
 * pulls in — is outdated or untouched. One edited, conflicting or unknown file
 * in that set rules it out: the suggestion is printed as safe to run as is.
 *
 * Among those, a greedy cover keeps the command short: the component reaching
 * the most outdated files still left goes first, ties broken by name. A shared
 * file then rides along with a component that needed re-copying anyway, rather
 * than every component that happens to import it being listed.
 */
export function planUpdate(
	registry: Registry,
	entries: readonly DiffEntry[],
	options: PlanOptions,
): UpdatePlan {
	const states = new Map(entries.map((entry) => [entry.file, entry.state]));
	const outdated = new Set(
		entries
			.filter((entry) => entry.state === "outdated")
			.map((entry) => entry.file),
	);

	const candidates: { name: string; reaches: Set<string> }[] = [];
	for (const item of registry.items) {
		if (!options.installed(item)) continue;
		const rewritten = new Set(
			resolveItems(registry, [item.name]).flatMap((entry) =>
				entry.files.map(options.toCopy),
			),
		);
		const lossy = [...rewritten].some((file) => {
			const state = states.get(file);
			return state !== undefined && state !== "outdated";
		});
		if (lossy) continue;
		const reaches = new Set(
			[...rewritten].filter((file) => outdated.has(file)),
		);
		if (reaches.size > 0) candidates.push({ name: item.name, reaches });
	}

	const left = new Set(outdated);
	const components: string[] = [];
	while (left.size > 0) {
		let best: { name: string; count: number } | undefined;
		for (const candidate of candidates) {
			let count = 0;
			for (const file of candidate.reaches) if (left.has(file)) count += 1;
			if (count === 0) continue;
			if (
				best === undefined ||
				count > best.count ||
				(count === best.count && candidate.name < best.name)
			) {
				best = { name: candidate.name, count };
			}
		}
		if (best === undefined) break;
		const chosen = best.name;
		components.push(chosen);
		for (const candidate of candidates) {
			if (candidate.name !== chosen) continue;
			for (const file of candidate.reaches) left.delete(file);
		}
	}

	return {
		components: components.sort(),
		uncovered: [...left].sort(),
	};
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
