/**
 * `ream nebula:diff` — which copied components no longer match the package.
 *
 * `nebula:add` hands you the source and steps back, so a fix released upstream
 * never reaches a project on its own. Nothing else reports that: the files are
 * local, no lockfile mentions them and `pnpm update` does not touch them. This
 * is the one place it becomes visible.
 */

import { type DiffState, diff } from "../cli/diff.js";
import { flag, type NebulaCommandClass } from "./contract.js";

/** What each state means, and what to do about it. */
const EXPLAIN: Record<DiffState, string> = {
	same: "",
	outdated: "the package moved, your copy is untouched — re-copy loses nothing",
	edited: "you changed it; the package has not moved",
	conflict: "you changed it AND the package moved — read both before copying",
	unknown: "copied before nebula recorded hashes; cannot tell which side moved",
};

export default class NebulaDiffCommand {
	static commandName = "nebula:diff";
	static description =
		"Report copied components that no longer match the installed package";

	// Files only; nothing here needs the container or a booted app.
	static options = { startApp: false };

	static args = [];

	static flags = [
		flag("ts", "boolean", {
			description: "Compare against the TypeScript sources",
		}),
		flag("js", "boolean", {
			description: "Compare against the compiled JavaScript",
		}),
	];

	static help = [
		"  ream nebula:diff",
		"",
		"Components are copied, so nothing upgrades them. This says which ones the",
		"package has since changed, and separates that from the edits you made —",
		"every component is expected to diverge eventually, so 'differs' alone",
		"would flag the whole tree and say nothing.",
		"",
		"Update one with `ream nebula:add <name> --force`, after reading the change",
		"if you had edited it.",
	];

	ts = false;
	js = false;

	async run(): Promise<void> {
		const result = diff({
			cwd: process.cwd(),
			language: this.ts ? "ts" : this.js ? "js" : undefined,
		});

		if (result.entries.length === 0) {
			process.stdout.write(
				"\n  Every copied component matches the installed package.\n\n",
			);
			return;
		}

		const width = Math.max(...result.entries.map((e) => e.file.length));
		const out: string[] = [""];
		for (const entry of result.entries) {
			out.push(
				`  ${entry.state.padEnd(9)} ${entry.file.padEnd(width)}  ${EXPLAIN[entry.state]}`,
			);
		}

		const outdated = result.entries.filter(
			(entry) => entry.state === "outdated",
		);
		if (outdated.length > 0) {
			out.push(
				"",
				`  ${outdated.length} can be updated with no loss:`,
				`    ream nebula:add --force ${outdated.map(componentOf).join(" ")}`,
			);
		}
		out.push("");
		process.stdout.write(out.join("\n"));
	}
}

/** `molecules/InputGroup.js` → `input-group`, as the registry names it. */
function componentOf(entry: { file: string }): string {
	const base = entry.file.split("/").pop() ?? entry.file;
	return base
		.replace(/\.(ts|js)$/, "")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase();
}

// Fails the build if the class drifts from what the kernel dispatches against.
const _contract: NebulaCommandClass = NebulaDiffCommand;
void _contract;
