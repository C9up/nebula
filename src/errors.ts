/**
 * Nebula errors, one class per code. An application branches on
 * `error.code` or on `error instanceof errors.E_…`; every one is a flare
 * `Exception`, with the HTTP status an exception handler answers with.
 *
 * Only the CLI and `configure` raise them: the component layers `nebula add`
 * copies into applications never import this file, so a copied component
 * does not need `@c9up/flare`.
 */

import { createError } from "@c9up/flare";

/** `config/nebula.ts` has no default export, or a `paths` / `language` entry of the wrong shape. */
export const E_NEBULA_INVALID_CONFIG = createError<[string]>(
	"[nebula] %s",
	"E_NEBULA_INVALID_CONFIG",
);

/** `nebula add` in a mode whose sources were not built (`dist/` for js). */
export const E_NEBULA_SOURCES_NOT_BUILT = createError<[string, string]>(
	"[nebula] %s is missing — run `pnpm build` in the nebula package before adding in %s mode.",
	"E_NEBULA_SOURCES_NOT_BUILT",
);

/** The shipped `registry.json` is not a nebula registry. */
export const E_NEBULA_INVALID_REGISTRY = createError<[string]>(
	"[nebula] %s is not a valid nebula registry — regenerate it with `pnpm registry`.",
	"E_NEBULA_INVALID_REGISTRY",
);

/** `nebula add` was given a component the registry does not hold. */
export const E_NEBULA_UNKNOWN_COMPONENT = createError<[string]>(
	'[nebula] unknown component "%s" — run `ream nebula:list` to see what exists.',
	"E_NEBULA_UNKNOWN_COMPONENT",
);

/** `configure --adapter` named an adapter other than tailwind, unocss or css. */
export const E_NEBULA_UNKNOWN_ADAPTER = createError<[string]>(
	'[nebula] unknown adapter "%s" — one of tailwind, unocss, css',
	"E_NEBULA_UNKNOWN_ADAPTER",
);
