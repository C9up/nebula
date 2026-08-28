/**
 * The programmatic surface behind `ream nebula:add`.
 *
 * The Rust CLI cannot read `registry.json` or resolve the package's own
 * install path, so — exactly as `nova.rs` does for VAPID keys — it runs Node
 * against this entry point and lets the package do its own work. Everything
 * that knows about the registry stays here, in the package that owns it.
 */

export {
	type AddOptions,
	type AddResult,
	add,
	detectLanguage,
} from "./add.js";
export {
	loadRegistry,
	packageRoot,
	type Registry,
	type RegistryItem,
	resolveItems,
} from "./registry.js";
