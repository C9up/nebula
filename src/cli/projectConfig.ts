/**
 * The app's `config/nebula.ts`, as the copying commands read it.
 *
 * shadcn's CLI reads `components.json` on every `add` and `diff`; these read
 * the config file the same way. Imported directly rather than taken from the
 * booted application: the console kernel hands the app — and its config —
 * only to a command that starts it, and starting it opens the connections a
 * file copy has no use for, and fails where they are not running.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Language, NebulaPaths } from "../config.js";

export interface ProjectConfig {
	paths?: Partial<NebulaPaths>;
	language?: Language;
}

/** Tried in order; the first that exists is the config. */
const CANDIDATES = ["nebula.ts", "nebula.js", "nebula.mjs"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathsOf(
	value: unknown,
	file: string,
): Partial<NebulaPaths> | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		throw new Error(`${file}: \`paths\` must be an object.`);
	}
	const paths: Partial<NebulaPaths> = {};
	for (const key of ["components", "css", "output"] as const) {
		const entry = value[key];
		if (entry === undefined) continue;
		if (typeof entry !== "string" || entry === "") {
			throw new Error(`${file}: \`paths.${key}\` must be a non-empty string.`);
		}
		paths[key] = entry;
	}
	return paths;
}

function languageOf(value: unknown, file: string): Language | undefined {
	if (value === undefined) return undefined;
	if (value === "ts" || value === "js") return value;
	throw new Error(`${file}: \`language\` must be "ts" or "js".`);
}

/** The config under `<cwd>/config`, or nothing when the app has none. */
export async function loadProjectConfig(cwd: string): Promise<ProjectConfig> {
	for (const name of CANDIDATES) {
		const file = join(cwd, "config", name);
		if (!existsSync(file)) continue;
		const label = `config/${name}`;
		const loaded: unknown = await import(pathToFileURL(file).href);
		const config = isRecord(loaded) ? loaded.default : undefined;
		if (!isRecord(config)) {
			throw new Error(`${label} must export its config as the default export.`);
		}
		return {
			paths: pathsOf(config.paths, label),
			language: languageOf(config.language, label),
		};
	}
	return {};
}
