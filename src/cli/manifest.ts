/**
 * What a copied component looked like when it was copied.
 *
 * The registry model hands you the source and steps back: from then on the file
 * is yours, and nothing upgrades it. That is the point, and it is also the one
 * thing it cannot tell you — when a component is fixed upstream, the copy in
 * your project stays as it was, and no install, lockfile or `pnpm update`
 * mentions it. shadcn has the same gap.
 *
 * Recording the hash of what was copied is what closes it. With it, three
 * different situations stop looking alike:
 *
 *   - the file still matches what was copied → upstream moving is a safe re-copy
 *   - the file was edited and upstream has not moved → nothing to do
 *   - both moved → a decision, and the only case that needs a person
 *
 * Without it, every edited component reads as "differs from upstream", which is
 * true of all of them by design and therefore says nothing.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Lives beside the components it describes, so moving the tree keeps it. */
export const MANIFEST_FILE = ".nebula.json";

export interface Manifest {
	/** Component path (as the registry names it) → hash of the copied bytes. */
	files: Record<string, string>;
}

/** Content hash of a file's bytes, or `undefined` when it is not there. */
export function hashOf(path: string): string | undefined {
	if (!existsSync(path)) return undefined;
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Read the manifest for a component tree.
 *
 * A missing or unreadable one is an empty manifest, never an error: a project
 * that copied components before this existed still has to work, and it simply
 * has nothing recorded yet.
 */
export function readManifest(componentsRoot: string): Manifest {
	const path = join(componentsRoot, MANIFEST_FILE);
	if (!existsSync(path)) return { files: {} };
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (typeof parsed !== "object" || parsed === null) return { files: {} };
		const files = Reflect.get(parsed, "files");
		if (typeof files !== "object" || files === null) return { files: {} };
		const entries: Record<string, string> = {};
		for (const [key, value] of Object.entries(files)) {
			if (typeof value === "string") entries[key] = value;
		}
		return { files: entries };
	} catch {
		return { files: {} };
	}
}

/** Merge new entries in and write the manifest back, sorted for a clean diff. */
export function writeManifest(
	componentsRoot: string,
	added: Record<string, string>,
): void {
	const existing = readManifest(componentsRoot);
	const merged = { ...existing.files, ...added };
	const sorted: Record<string, string> = {};
	for (const key of Object.keys(merged).sort()) {
		const value = merged[key];
		if (value !== undefined) sorted[key] = value;
	}
	writeFileSync(
		join(componentsRoot, MANIFEST_FILE),
		`${JSON.stringify({ files: sorted }, null, 2)}\n`,
	);
}
