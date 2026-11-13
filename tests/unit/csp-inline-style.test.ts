/**
 * No component writes a `style` attribute.
 *
 * A Content-Security-Policy without `'unsafe-inline'` — `default-src 'self'`
 * with no `style-src`, the default of the framework's own security middleware —
 * blocks every `style` attribute: in the server's markup, in markup parsed on
 * the client, and through `setAttribute`. The component then renders without
 * the rule, and Sonner's toasts fell into the page flow. What the policy does
 * not touch is the CSSOM (`element.style.x = …`, or a `.style` property
 * binding, which assigns `cssText`), and SVG presentation attributes.
 *
 * The check runs on the three paths a `style` attribute could take: the source
 * of every template (which also covers parts that only render once opened), the
 * server's markup for every registry component, and every `setAttribute` the
 * client makes while mounting one.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { html, renderToString, resetIds, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AspectRatio } from "../../src/atoms/AspectRatio.js";
import { Progress } from "../../src/atoms/Progress.js";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../../src/molecules/Accordion.js";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "../../src/molecules/Resizable.js";
import { Toaster, toast } from "../../src/organisms/Sonner.js";
import { mount } from "./helpers.js";
import { cases, registryNames } from "./registry-cases.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sourceFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFiles(path));
		else if (entry.name.endsWith(".ts")) files.push(path);
	}
	return files;
}

/**
 * A `style` attribute written in a template: `style="…"` not preceded by the
 * `.` of a property binding or by a name character (`data-style=` is fine).
 */
const STYLE_ATTRIBUTE = /(?<![.\w-])style\s*=\s*["'$]/;
/** `setAttribute("style", …)` and its namespaced and node forms. */
const STYLE_SET_ATTRIBUTE =
	/setAttribute(?:NS)?\(\s*(?:[^,]+,\s*)?["'`]style["'`]|createAttribute\(\s*["'`]style["'`]/;

/**
 * Record every `setAttribute`-family call naming `style` until `stop()`. The
 * calls still go through: only the name is noted.
 */
function watchStyleAttributeWrites(): { writes: string[]; stop(): void } {
	const writes: string[] = [];
	const record = (element: Element, name: string): void => {
		if (name.toLowerCase() === "style") {
			writes.push(element.getAttribute("data-slot") ?? element.localName);
		}
	};
	const setAttribute = Element.prototype.setAttribute;
	const setAttributeNS = Element.prototype.setAttributeNS;
	const toggleAttribute = Element.prototype.toggleAttribute;
	const spies = [
		vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (
			this: Element,
			name,
			value,
		) {
			record(this, name);
			setAttribute.call(this, name, value);
		}),
		vi.spyOn(Element.prototype, "setAttributeNS").mockImplementation(function (
			this: Element,
			namespace,
			name,
			value,
		) {
			record(this, name);
			setAttributeNS.call(this, namespace, name, value);
		}),
		vi.spyOn(Element.prototype, "toggleAttribute").mockImplementation(function (
			this: Element,
			name,
			force,
		) {
			record(this, name);
			return toggleAttribute.call(this, name, force);
		}),
	];
	return {
		writes,
		stop(): void {
			for (const spy of spies) spy.mockRestore();
		},
	};
}

afterEach(() => {
	document.body.innerHTML = "";
	document.body.style.cssText = "";
});

describe("nebula > Content-Security-Policy: no style attribute", () => {
	it("no template in the source writes one", () => {
		const offenders: string[] = [];
		for (const file of sourceFiles(join(root, "src"))) {
			const lines = readFileSync(file, "utf8").split("\n");
			lines.forEach((line, index) => {
				if (STYLE_ATTRIBUTE.test(line) || STYLE_SET_ATTRIBUTE.test(line)) {
					offenders.push(
						`${relative(root, file)}:${index + 1}: ${line.trim()}`,
					);
				}
			});
		}
		expect(offenders).toEqual([]);
	});

	it("the source scan recognises what it must refuse", () => {
		// Guards the regular expressions themselves: a scan that matched
		// nothing would pass the test above for any source. `slot` spells the
		// `${…}` of a template slot as it reads in the source.
		const slot = ["$", "{x}"].join("");
		expect(STYLE_ATTRIBUTE.test(`<div style="${slot}">`)).toBe(true);
		expect(STYLE_ATTRIBUTE.test("<div style='color:red'>")).toBe(true);
		expect(STYLE_ATTRIBUTE.test(`<div style=${slot}>`)).toBe(true);
		expect(STYLE_ATTRIBUTE.test(`<div .style="${slot}">`)).toBe(false);
		expect(STYLE_ATTRIBUTE.test('<div data-style="x">')).toBe(false);
		expect(STYLE_SET_ATTRIBUTE.test('node.setAttribute("style", rule)')).toBe(
			true,
		);
		expect(
			STYLE_SET_ATTRIBUTE.test('node.setAttributeNS(null, "style", rule)'),
		).toBe(true);
		expect(STYLE_SET_ATTRIBUTE.test('node.setAttribute("class", "x")')).toBe(
			false,
		);
	});

	for (const testCase of cases) {
		it(`${testCase.name}: none in the server's markup`, () => {
			resetIds();
			const host = document.createElement("div");
			host.innerHTML = renderToString(testCase.build());
			const styled = [...host.querySelectorAll("[style]")].map((element) =>
				element.outerHTML.slice(0, 120),
			);
			expect(styled).toEqual([]);
		});

		it(`${testCase.name}: none set while it mounts on the client`, () => {
			const watch = watchStyleAttributeWrites();
			try {
				mount(testCase.build()).dispose();
			} finally {
				watch.stop();
			}
			expect(watch.writes).toEqual([]);
		});
	}

	it("covers every component the registry ships", async () => {
		const tested = new Set(cases.map((entry) => entry.name));
		const untested = (await registryNames()).filter(
			(name) => !tested.has(name),
		);
		expect(untested).toEqual([]);
	});

	it("Sonner places and stacks its toasts through the CSSOM", async () => {
		vi.useFakeTimers();
		const watch = watchStyleAttributeWrites();
		try {
			const view = mount(Toaster({}));
			toast("First");
			toast("Second");
			await vi.advanceTimersByTimeAsync(0);
			const list = document.querySelector<HTMLElement>("[data-sonner-toaster]");
			const rows = [
				...document.querySelectorAll<HTMLElement>("[data-sonner-toast]"),
			];
			expect(watch.writes).toEqual([]);
			// The rules still land — written through the CSSOM, which the policy
			// leaves alone.
			expect(list?.style.position).toBe("fixed");
			expect(list?.style.bottom).toBe("24px");
			expect(list?.style.right).toBe("24px");
			expect(rows).toHaveLength(2);
			expect(rows[1]?.style.transform).toContain("scale(0.95)");
			// Before hydration the server's list is already out of the flow.
			expect(list?.classList.contains("fixed")).toBe(true);
			toast.dismiss();
			await vi.advanceTimersByTimeAsync(500);
			view.dispose();
		} finally {
			watch.stop();
			vi.useRealTimers();
		}
	});
});

/** The server's markup for `template`, parsed. */
function serverMarkup(template: ReturnType<typeof html>): HTMLElement {
	resetIds();
	const host = document.createElement("div");
	host.innerHTML = renderToString(template);
	return host;
}

describe("nebula > Content-Security-Policy: what the server's markup still shows", () => {
	it("Progress: the fill stands at the value before any script runs", () => {
		const host = serverMarkup(Progress({ value: 40 }));
		const fill = host.querySelector("[data-slot='progress-indicator'] rect");
		expect(fill?.getAttribute("transform")).toBe("translate(-60 0)");
	});

	it("Progress: the fill follows the value on the client", () => {
		const value = signal<number | null>(25);
		const view = mount(Progress({ value }));
		const fill = view.host.querySelector(
			"[data-slot='progress-indicator'] rect",
		);
		expect(fill?.getAttribute("transform")).toBe("translate(-75 0)");
		value(90);
		expect(fill?.getAttribute("transform")).toBe("translate(-10 0)");
		// Indeterminate: an empty track.
		value(null);
		expect(fill?.getAttribute("transform")).toBe("translate(-100 0)");
		view.dispose();
	});

	it("AspectRatio: the ratio is in the server's viewBox, and a bad one falls back to square", () => {
		const wide = serverMarkup(AspectRatio({ ratio: 2, children: "x" }));
		expect(
			wide
				.querySelector("[data-slot='aspect-ratio'] > svg")
				?.getAttribute("viewBox"),
		).toBe("0 0 2 1");
		const broken = serverMarkup(AspectRatio({ ratio: 0 }));
		expect(
			broken
				.querySelector("[data-slot='aspect-ratio'] > svg")
				?.getAttribute("viewBox"),
		).toBe("0 0 1 1");
		// The content overlays the sizer, so it fills the box the ratio makes.
		expect(
			wide.querySelector("[data-slot='aspect-ratio'] > div.absolute.inset-0")
				?.textContent,
		).toBe("x");
	});

	it("Accordion: a closed item is flattened by a class the server writes", () => {
		const host = serverMarkup(
			Accordion({
				type: "single",
				children: () =>
					AccordionItem({
						value: "a",
						children: () =>
							html`${AccordionTrigger({ children: "A" })}${AccordionContent({
								children: "Body",
							})}`,
					}),
			}),
		);
		const panel = host.querySelector<HTMLElement>(
			"[data-slot='accordion-content']",
		);
		expect(panel?.dataset.state).toBe("closed");
		expect(panel?.classList.contains("grid-rows-[0fr]")).toBe(true);
		expect(panel?.classList.contains("data-[state=open]:grid-rows-[1fr]")).toBe(
			true,
		);
	});

	it("Resizable: both panes split evenly until hydration, then the first takes its share", () => {
		const group = (): ReturnType<typeof html> =>
			ResizablePanelGroup({
				direction: "horizontal",
				defaultSize: 30,
				children: () =>
					html`${ResizablePanel({ children: "A" })}${ResizableHandle({})}${ResizablePanel({ children: "B" })}`,
			});
		const panes = [
			...serverMarkup(group()).querySelectorAll(
				"[data-slot='resizable-panel']",
			),
		];
		expect(panes.map((pane) => pane.classList.contains("flex-1"))).toEqual([
			true,
			true,
		]);
		const view = mount(group());
		const [first, second] = [
			...view.host.querySelectorAll<HTMLElement>(
				"[data-slot='resizable-panel']",
			),
		];
		expect(first?.style.flex).toBe("0 0 30%");
		expect(second?.style.flex).toBe("");
		view.dispose();
	});
});
