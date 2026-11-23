import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Exception } from "@c9up/flare";
import { describe, expect, it } from "vitest";
import { errors } from "../../src/index.js";

/** Every file under `dir`, recursively. */
function filesUnder(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? filesUnder(path) : [path];
	});
}

describe("nebula > errors", () => {
	it("the entry exports every error as one `errors` namespace", () => {
		const error = new errors.E_NEBULA_UNKNOWN_COMPONENT(["nope"]);
		expect(error).toBeInstanceOf(Exception);
		expect(error).toBeInstanceOf(errors.E_NEBULA_UNKNOWN_COMPONENT);
		expect(error.code).toBe("E_NEBULA_UNKNOWN_COMPONENT");
		expect(error.status).toBe(500);
		expect(error.message).toBe(
			'[nebula] unknown component "nope" — run `ream nebula:list` to see what exists.',
		);
	});

	it("no layer `nebula add` copies imports the errors or flare", () => {
		// A copied component lands in an app that may not have @c9up/flare.
		const root = join(import.meta.dirname, "../../src");
		const layers = [
			"lib",
			"primitives",
			"atoms",
			"molecules",
			"organisms",
			"templates",
		];
		for (const layer of layers) {
			for (const file of filesUnder(join(root, layer))) {
				const source = readFileSync(file, "utf8");
				expect(source, file).not.toMatch(/errors\.js|@c9up\/flare/);
			}
		}
	});
});
