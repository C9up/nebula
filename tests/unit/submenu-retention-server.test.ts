// @vitest-environment node
/**
 * A submenu built on the server keeps nothing once the render is done.
 *
 * A submenu's panel factory closes over its items, which close over the
 * user's data. The factory used to be stored in a module-level map while the
 * template was built, and only a menu opened in a browser took it out: every
 * live session and every `auroraRoute` request with a submenu stayed reachable
 * for the life of the process. Now it is registered when the trigger mounts,
 * which never happens on the server.
 *
 * Small loops: each render closes over a 20 KB object, and a `WeakRef` says
 * whether it is still reachable after a forced collection.
 */
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import {
	auroraRoute,
	createLiveRegistry,
	createLiveRouter,
	html,
	renderToString,
	type TemplateResult,
} from "@c9up/aurora";
import { Pages, renderPage } from "@c9up/aurora/server";
import { describe, expect, it } from "vitest";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../../src/organisms/DropdownMenu.js";
import { menuPanel } from "../../src/primitives/menu.js";

setFlagsFromString("--expose-gc");
const gc: () => void = runInNewContext("gc");

/** A user's menu: the submenu's item closes over that user's data. */
function menu(secret: { payload: string }): TemplateResult {
	const item = () =>
		DropdownMenuItem({
			children: "Export",
			onSelect: () => void secret.payload.length,
		});
	return DropdownMenu({
		children: () =>
			html`${DropdownMenuTrigger({ children: "Account" })}${DropdownMenuContent(
				{
					children: () =>
						DropdownMenuSub({
							children: () =>
								html`${DropdownMenuSubTrigger({ children: "More" })}${DropdownMenuSubContent({ children: item })}`,
						}),
				},
			)}`,
	});
}

/** A WeakRef keeps its target until the current job ends: leave it, then collect. */
async function collect(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
		gc();
	}
}

function tracker() {
	const refs: WeakRef<object>[] = [];
	return {
		secret(): { payload: string } {
			const secret = { payload: `${"x".repeat(20_000)}${refs.length}` };
			refs.push(new WeakRef(secret));
			return secret;
		},
		async alive(): Promise<number> {
			await collect();
			return refs.filter((ref) => ref.deref() !== undefined).length;
		},
	};
}

/** A panel described as entries, its submenu's item closing over `secret`. */
function renderEntries(secret: { payload: string }): void {
	renderToString(
		menuPanel({
			id: "menu",
			onCloseAll: () => {},
			entries: [
				{
					type: "submenu",
					label: "More",
					entries: [
						{ label: "Export", onSelect: () => void secret.payload.length },
					],
				},
			],
		}),
	);
}

const response = () => {
	const res = {
		status: () => res,
		header: () => res,
		send: () => {},
	};
	return res;
};

describe("nebula > submenus on the server", () => {
	it("keeps nothing of a live session once it is disposed", async () => {
		const seen = tracker();
		const registry = createLiveRegistry();
		const live = createLiveRouter(registry, { broadcast: () => 0 });
		registry.define("Menu", () => ({
			view: html`<nav>${menu(seen.secret())}</nav>`,
		}));
		for (let i = 0; i < 20; i++) {
			const { id } = live.mount("Menu", `visitor-${i}`);
			registry.dispose(id);
		}
		expect(registry.size()).toBe(0);
		expect(await seen.alive()).toBe(0);
	}, 30_000);

	it("keeps nothing of an auroraRoute request", async () => {
		const seen = tracker();
		const handler = auroraRoute({
			render: () => html`<nav>${menu(seen.secret())}</nav>`,
		});
		for (let i = 0; i < 20; i++) {
			await handler({ request: {}, response: response() });
		}
		expect(await seen.alive()).toBe(0);
	}, 30_000);

	it("keeps nothing of a renderPage request, not even the last one", async () => {
		const seen = tracker();
		const pages = new Pages({ root: "/nonexistent-nebula-pages" });
		pages.register("menu", () => html`<nav>${menu(seen.secret())}</nav>`);
		for (let i = 0; i < 20; i++) {
			await renderPage(
				{ request: {}, response: response() },
				pages,
				"menu",
				{},
			);
		}
		expect(await seen.alive()).toBe(0);
	}, 30_000);

	it("keeps nothing of a submenu described as entries", async () => {
		const seen = tracker();
		for (let i = 0; i < 20; i++) renderEntries(seen.secret());
		expect(await seen.alive()).toBe(0);
	}, 30_000);
});
