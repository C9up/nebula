/// <reference lib="dom" />
/**
 * Modal surface — the lifecycle of a dialog-shaped overlay.
 *
 * Dialog, AlertDialog, Sheet and Drawer differ only in where they come from
 * and how they animate. What they share is the modal contract, and every part
 * of it is a thing an app gets wrong when it builds one by hand:
 *
 * - A backdrop, so the page behind reads as unavailable.
 * - Focus trapped inside, and returned to the trigger on close.
 * - Page scroll locked, without the sideways jump when the scrollbar goes.
 * - Escape closes; a click on the backdrop closes, unless the surface is
 *   asking a question that must be answered (AlertDialog).
 * - The rest of the page hidden from assistive technology, so a screen reader
 *   cannot wander out of the dialog while sighted users cannot.
 *
 * That last one is the one almost always missed. Trapping *keyboard* focus
 * does nothing for a reader navigating by heading or landmark — it will read
 * straight through the page behind the overlay. `aria-hidden` on the siblings
 * of the portal is what actually makes the dialog modal.
 */

import { effect, onMount, type TemplateResult } from "@c9up/aurora";
import {
	type DismissableLayer,
	type DismissReason,
	dismissable,
} from "./dismissable.js";
import { type FocusTrap, focusTrap } from "./focusTrap.js";
import { type Portal, portal } from "./portal.js";
import { onExitFinished } from "./presence.js";
import { lockScroll } from "./scrollLock.js";

export interface ModalSurfaceOptions {
	open: () => boolean;
	onClose: (reason: DismissReason) => void;
	/** The whole overlay: backdrop and panel. */
	content: () => TemplateResult;
	/**
	 * The panel within the content, when the content's root is a full-screen
	 * wrapper.
	 *
	 * Containment is answered against this, not the root. An overlay's root
	 * usually spans the viewport so the backdrop can, and a root-based check
	 * would report every click on the page as "inside" — outside-click dismissal
	 * would silently never fire. The focus trap needs the same distinction:
	 * trapping to the root would let Tab reach the backdrop.
	 *
	 * Defaults to the root, which is right for an overlay that is only a panel.
	 */
	panel?: (root: HTMLElement) => HTMLElement | null;
	/** Where focus lands. Defaults to the first focusable element. */
	initialFocus?: (content: HTMLElement) => HTMLElement | null;
	/** Where focus returns. Defaults to whatever was focused before opening. */
	returnFocus?: () => HTMLElement | null;
	/** A click outside closes. `false` for a decision that must be made. */
	dismissOnOutside?: boolean;
	/** Escape closes. `false` for the same reason. */
	dismissOnEscape?: boolean;
	/** Hold page scroll. Default `true`. */
	lockScroll?: boolean;
	onOpened?: (content: HTMLElement) => void;
	onClosed?: () => void;
}

interface Armed {
	readonly layer: DismissableLayer;
	readonly trap: FocusTrap;
	readonly restoreSiblings: () => void;
}

interface Live {
	readonly mount: Portal;
	/** Carries `data-state`; the exit animation is watched here. */
	readonly element: HTMLElement;
	readonly panel: HTMLElement;
	readonly unlock: () => void;
	/** What makes it modal: `null` once closed, through its exit. */
	armed: Armed | null;
	cancelExit: (() => void) | null;
}

export function modalSurface(options: ModalSurfaceOptions): void {
	let live: Live | null = null;

	function arm(host: HTMLElement, panel: HTMLElement): Armed {
		const restoreSiblings = hideSiblingsFrom(host);
		const trap = focusTrap(panel, {
			initialFocus: () => options.initialFocus?.(panel) ?? null,
			returnFocus: options.returnFocus,
		});
		const layer = dismissable({
			element: () => panel,
			onDismiss: options.onClose,
			escapeKey: options.dismissOnEscape !== false,
			outsidePointer: options.dismissOnOutside !== false,
			outsideFocus: false,
		});
		return { layer, trap, restoreSiblings };
	}

	function disarm(current: Live): void {
		const armed = current.armed;
		if (armed === null) return;
		current.armed = null;
		armed.layer.remove();
		armed.trap.release();
		armed.restoreSiblings();
	}

	function show(): void {
		if (live !== null) {
			// Reopened while its exit was still playing: the same node comes
			// back, and it is a modal again, not a panel the page reads through.
			live.cancelExit?.();
			live.cancelExit = null;
			live.element.setAttribute("data-state", "open");
			if (live.armed === null) live.armed = arm(live.mount.host, live.panel);
			return;
		}

		const mount = portal(options.content());
		const element = mount.host.firstElementChild;
		if (!(element instanceof HTMLElement)) {
			mount.close();
			return;
		}
		element.setAttribute("data-state", "open");

		const panel = options.panel?.(element) ?? element;
		const unlock = options.lockScroll === false ? () => {} : lockScroll();

		live = {
			mount,
			element,
			panel,
			unlock,
			armed: arm(mount.host, panel),
			cancelExit: null,
		};
		options.onOpened?.(panel);
	}

	function hide(): void {
		const current = live;
		if (current === null || current.armed === null) return;

		disarm(current);
		current.element.setAttribute("data-state", "closed");
		options.onClosed?.();

		// Scroll stays locked through the exit animation. Releasing it first
		// lets the page jump back under a panel that is still sliding away.
		current.cancelExit = onExitFinished(current.element, () => {
			current.unlock();
			current.mount.close();
			if (live === current) live = null;
		});
	}

	function teardown(): void {
		const current = live;
		if (current === null) return;
		live = null;
		current.cancelExit?.();
		disarm(current);
		current.unlock();
		current.mount.close();
	}

	onMount(() => {
		const stop = effect(() => {
			if (options.open()) show();
			else hide();
		});
		return () => {
			stop();
			teardown();
		};
	});
}

/** How many open modals hide each node; it is shown again at zero. */
const hiddenBy = new WeakMap<Element, number>();
/** Nodes that were already `aria-hidden` when the first modal reached them. */
const hiddenBefore = new WeakSet<Element>();

/**
 * Hide everything except the overlay from assistive technology.
 *
 * Marks each sibling of the portal host. Counted per node, as the
 * `aria-hidden` package Radix modals use does: stacked modals hide the same
 * page, and they close in any order — a confirm that closes its parent sheet
 * before itself is enough — so a node is shown again only when the last
 * modal hiding it lets go. A node the application had hidden itself is never
 * touched.
 *
 * Only siblings of the host, not the whole page: a second modal hides the
 * first one's host along with the page, and shows it again when it closes.
 *
 * The returned release runs once, however many paths reach it.
 */
function hideSiblingsFrom(host: HTMLElement): () => void {
	const parent = host.parentElement;
	if (parent === null) return () => {};

	const hidden: Element[] = [];
	for (const sibling of parent.children) {
		if (sibling === host) continue;
		// A live region announcing outside the dialog (a toast) is deliberate.
		if (sibling.hasAttribute("data-nebula-live")) continue;
		const count = (hiddenBy.get(sibling) ?? 0) + 1;
		hiddenBy.set(sibling, count);
		hidden.push(sibling);
		const attribute = sibling.getAttribute("aria-hidden");
		const alreadyHidden = attribute !== null && attribute !== "false";
		if (count === 1 && alreadyHidden) hiddenBefore.add(sibling);
		if (!alreadyHidden) sibling.setAttribute("aria-hidden", "true");
	}

	let released = false;
	return (): void => {
		if (released) return;
		released = true;
		for (const element of hidden) {
			const count = (hiddenBy.get(element) ?? 1) - 1;
			if (count > 0) {
				hiddenBy.set(element, count);
				continue;
			}
			hiddenBy.delete(element);
			if (!hiddenBefore.has(element)) element.removeAttribute("aria-hidden");
			hiddenBefore.delete(element);
		}
	};
}
