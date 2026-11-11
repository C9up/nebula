/// <reference lib="dom" />
/**
 * Portal — mount a template outside the component's own DOM position.
 *
 * Overlays have to escape their parent. A Popover rendered where it is
 * declared inherits every `overflow: hidden`, `transform` and `z-index` stack
 * between it and the root, and any one of those will clip it or bury it. The
 * fix is universal: render into `<body>` and position with fixed coordinates.
 *
 * Aurora's `render()` already mounts a `TemplateResult` anywhere and hands
 * back a disposer, so a portal is that call plus a host element to hold the
 * content and the discipline to tear both down together.
 */

import { onMount, render, type TemplateResult } from "@c9up/aurora";

export interface PortalOptions {
	/** Where to mount. Defaults to `document.body`. */
	container?: () => Element | null;
	/** Extra classes for the host element. */
	class?: string;
}

export interface Portal {
	/** The element holding the portalled content. */
	readonly host: HTMLElement;
	/** Unmount the content and remove the host. Safe to call twice. */
	close(): void;
}

/**
 * Mount `content` into a fresh host element appended to the container.
 *
 * A host element rather than mounting straight into `<body>`: it gives the
 * content one node to be removed as a unit, keeps sibling portals from
 * interleaving, and gives the layer a place to hang `data-nebula-portal` so a
 * test — or a developer in the inspector — can see what put it there.
 */
export function portal(
	content: TemplateResult,
	options: PortalOptions = {},
): Portal {
	const container = options.container?.() ?? document.body;
	const host = document.createElement("div");
	host.setAttribute("data-nebula-portal", "");
	if (options.class !== undefined) host.className = options.class;
	container.appendChild(host);

	const dispose = render(content, host);

	let closed = false;
	return {
		host,
		close(): void {
			if (closed) return;
			closed = true;
			dispose();
			host.remove();
		},
	};
}

export interface PortalPartOptions extends PortalOptions {
	/** The host's `data-slot`, naming the part that put it there. */
	slot: string;
}

/**
 * Portal `content` once the calling component is mounted, and close it when
 * the component unmounts. Call it from a component's setup.
 *
 * Setup also runs inside `renderToString`, where there is no document to
 * append a host to, so the portal waits for the mount: the server renders
 * nothing in place and the content is client-only, as a portal that renders
 * only after its mount effect is. The close rides on the same hook, so a part
 * cannot open a portal without also taking it away.
 */
export function portalOnMount(
	content: TemplateResult,
	options: PortalPartOptions,
): void {
	onMount(() => {
		const mounted = portal(content, options);
		mounted.host.setAttribute("data-slot", options.slot);
		return () => mounted.close();
	});
}
