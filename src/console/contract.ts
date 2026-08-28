/**
 * The console-command contract, declared locally.
 *
 * nebula must not import `@c9up/ream`. It is a component package whose only
 * peer is aurora, and taking on the framework to describe two commands would
 * be the tail wagging the dog. Atlas reached the same conclusion for its seven
 * migration commands and declares the same shape in its own `contract.ts`;
 * this is that decision, repeated because the reason is the same.
 *
 * What the kernel actually needs is structural: a class with `commandName`,
 * `description` and a `run()`, plus the metadata it reads to parse argv into
 * instance properties. Ream's `@args` / `@flags` decorators build that
 * metadata; these helpers build the identical shape without them.
 */

export interface CommandOptions {
	/** Boot the application before `run()`. Off — nebula touches only files. */
	startApp?: boolean;
	staysAlive?: boolean;
	allowUnknownFlags?: boolean;
}

export interface ArgumentMetaData {
	type: "string" | "spread";
	propertyName: string;
	argumentName: string;
	description?: string;
	required: boolean;
	default?: string | string[];
}

export interface FlagMetaData {
	type: "string" | "boolean" | "number" | "array";
	propertyName: string;
	flagName: string;
	description?: string;
	alias: string[];
	default?: string | string[] | number | boolean;
	required: boolean;
}

/** The static side the kernel reads. */
export interface NebulaCommandClass {
	new (): { run(): Promise<void> | void };
	commandName: string;
	description: string;
	options?: CommandOptions;
	args?: readonly ArgumentMetaData[];
	flags?: readonly FlagMetaData[];
	help?: string | string[];
}

/** `dryRun` → `dry-run`, matching what the framework's decorators produce. */
function dashCase(value: string): string {
	return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function flag(
	propertyName: string,
	type: FlagMetaData["type"],
	options: {
		flagName?: string;
		description?: string;
		alias?: string[];
		default?: FlagMetaData["default"];
		required?: boolean;
	} = {},
): FlagMetaData {
	return {
		type,
		propertyName,
		flagName: options.flagName ?? dashCase(propertyName),
		description: options.description,
		alias: options.alias ?? [],
		default: options.default,
		required: options.required ?? false,
	};
}

export function argument(
	propertyName: string,
	options: {
		type?: ArgumentMetaData["type"];
		argumentName?: string;
		description?: string;
		required?: boolean;
		default?: ArgumentMetaData["default"];
	} = {},
): ArgumentMetaData {
	return {
		type: options.type ?? "string",
		propertyName,
		argumentName: options.argumentName ?? dashCase(propertyName),
		description: options.description,
		required: options.required ?? options.default === undefined,
		default: options.default,
	};
}
