/**
 * `ream nebula:list` — show what the registry holds.
 *
 * Reads `registry.json` out of the installed package, which is why this lives
 * here and not in the binary: the CLI can neither resolve where nebula is
 * installed nor parse a format that belongs to this repo.
 */

import { join } from "node:path";
import { loadRegistry, packageRoot } from "../cli/registry.js";
import { flag, type NebulaCommandClass } from "./contract.js";

const LAYERS = ["atoms", "molecules", "organisms", "templates"] as const;

export default class NebulaListCommand {
	static commandName = "nebula:list";
	static description =
		"List the nebula components available to `ream nebula:add`";
	static options = { startApp: false };

	static flags = [
		flag("layer", "string", {
			description: `Restrict to one atomic layer (${LAYERS.join(", ")})`,
		}),
	];

	layer?: string;

	async run(): Promise<void> {
		const root = packageRoot(join(process.cwd(), "package.json"));
		const registry = loadRegistry(join(root, "registry.json"));

		if (
			this.layer !== undefined &&
			!LAYERS.some((name) => name === this.layer)
		) {
			// Named but unknown: a typo would otherwise print nothing at all and
			// read as "the registry is empty".
			process.stderr.write(
				`Unknown layer "${this.layer}" — one of ${LAYERS.join(", ")}.\n`,
			);
			process.exitCode = 1;
			return;
		}

		const out: string[] = [];
		for (const layer of LAYERS) {
			if (this.layer !== undefined && this.layer !== layer) continue;
			const names = registry.items
				.filter((item) => item.layer === layer)
				.map((item) => item.name);
			if (names.length === 0) continue;
			out.push("", `  ${layer} (${names.length})`, `  ${names.join(", ")}`);
		}
		out.push("");
		process.stdout.write(out.join("\n"));
	}
}

const _contract: NebulaCommandClass = NebulaListCommand;
void _contract;
