/**
 * `ream nebula:add <component…>` — copy components into the project.
 *
 * A command class registered through `reamrc.commands`, which is the channel
 * Ream provides for commands a package ships and directory discovery cannot
 * see. `ream` dispatches any unrecognised name to the app's console kernel,
 * so nothing has to be added to the binary for this to exist.
 *
 * That matters more than it looks: the alternative — a subcommand compiled
 * into `ream-cli` — makes every package that wants a command wait on a release
 * of a Rust binary, and that binary is not on crates.io.
 */

import { add } from "../cli/add.js";
import { argument, flag, type NebulaCommandClass } from "./contract.js";

export default class NebulaAddCommand {
	static commandName = "nebula:add";
	static description =
		"Copy nebula components into the project — they become yours to edit";

	// Files only; nothing here needs the container or a booted app.
	static options = { startApp: false };

	static args = [
		argument("components", {
			type: "spread",
			description: "Component names, as `ream nebula:list` prints them",
		}),
	];

	static flags = [
		flag("force", "boolean", {
			description: "Overwrite files that already exist",
		}),
		flag("dryRun", "boolean", {
			description: "Print what would happen and write nothing",
		}),
		flag("ts", "boolean", {
			description: "Copy TypeScript sources instead of the compiled output",
		}),
		flag("js", "boolean", {
			description:
				"Copy the compiled JavaScript (the default for an unbuilt app)",
		}),
	];

	static help = [
		"  ream nebula:add button card",
		"  ream nebula:add dialog --force",
		"",
		"Components are copied, not linked. Once they are in your project they are",
		"yours: edit the class strings, delete what you do not use, and nothing",
		"upgrades them behind your back.",
	];

	components: string[] = [];
	force = false;
	dryRun = false;
	ts = false;
	js = false;

	async run(): Promise<void> {
		if (this.components.length === 0) {
			process.stderr.write(
				"Name at least one component — `ream nebula:add button`.\n" +
					"`ream nebula:list` shows what the registry holds.\n",
			);
			process.exitCode = 1;
			return;
		}

		const result = add({
			cwd: process.cwd(),
			names: this.components,
			force: this.force,
			dryRun: this.dryRun,
			language: this.ts ? "ts" : this.js ? "js" : undefined,
		});

		const out: string[] = [""];
		for (const path of result.written) out.push(`  create  ${path}`);
		for (const path of result.skipped) out.push(`  exists  ${path}`);
		if (result.skipped.length > 0) {
			out.push(
				"",
				"  Existing files were left alone. Re-run with --force to overwrite.",
			);
		}
		// Stated rather than assumed: the language is inferred from the tree in
		// most runs, and copying the wrong one writes files the project cannot
		// load — a silent failure worth one line to prevent.
		out.push(
			"",
			`  Copied as ${result.language === "ts" ? "TypeScript" : "JavaScript"}. Override with --ts or --js.`,
			"",
		);
		process.stdout.write(out.join("\n"));
	}
}

// Fails the build if the class drifts from what the kernel dispatches against.
const _contract: NebulaCommandClass = NebulaAddCommand;
void _contract;
