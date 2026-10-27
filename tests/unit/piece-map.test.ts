import { html, signal } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	type Piece,
	PieceMap,
	PieceMapLegend,
} from "../../src/molecules/PieceMap.js";
import { mount } from "./helpers.js";

afterEach(() => {
	document.body.innerHTML = "";
});

type State = "have" | "coming" | "missing";

const tones = {
	have: "bg-primary",
	coming: "bg-chart-4 animate-pulse",
	missing: "border border-border",
} satisfies Record<State, string>;

const pieces = (host: HTMLElement): HTMLElement[] => [
	...host.querySelectorAll<HTMLElement>("[data-slot='piece']"),
];

describe("PieceMap", () => {
	it("paints each piece with its state's tone, and keeps its title", () => {
		const view = mount(
			PieceMap<State>({
				groups: [
					[
						{ state: "have", title: "piece 1" },
						{ state: "missing", title: "piece 2" },
					],
				],
				tones,
			}),
		);
		const [first, second] = pieces(view.host);

		expect(first?.dataset.state).toBe("have");
		expect(first?.classList.contains("bg-primary")).toBe(true);
		expect(first?.title).toBe("piece 1");
		expect(second?.dataset.state).toBe("missing");
		expect(second?.classList.contains("border-border")).toBe(true);
		expect(second?.classList.contains("bg-primary")).toBe(false);
		view.dispose();
	});

	it("sets every group after the first apart with a rule", () => {
		const view = mount(
			PieceMap<State>({
				groups: [
					[{ state: "have" }],
					[{ state: "missing" }, { state: "have" }],
				],
				tones,
			}),
		);
		const groups = [
			...view.host.querySelectorAll<HTMLElement>(
				"[data-slot='piece-map-group']",
			),
		];

		expect(groups.map((g) => g.children.length)).toEqual([1, 2]);
		expect(groups[0]?.classList.contains("border-s")).toBe(false);
		expect(groups[1]?.classList.contains("border-s")).toBe(true);
		view.dispose();
	});

	it("is one image named by its label, and plain without one", () => {
		const named = mount(
			PieceMap<State>({
				groups: [[{ state: "have" }]],
				tones,
				label: "1 of 1 pieces",
			}),
		);
		const root = named.host.querySelector("[data-slot='piece-map']");
		expect(root?.getAttribute("role")).toBe("img");
		expect(root?.getAttribute("aria-label")).toBe("1 of 1 pieces");
		named.dispose();

		const plain = mount(
			PieceMap<State>({ groups: [[{ state: "have" }]], tones }),
		);
		const bare = plain.host.querySelector("[data-slot='piece-map']");
		expect(bare?.hasAttribute("role")).toBe(false);
		expect(bare?.hasAttribute("aria-label")).toBe(false);
		plain.dispose();
	});

	it("draws the pieces again when the accessor's value changes", () => {
		const groups = signal<readonly (readonly Piece<State>[])[]>([
			[{ state: "missing" }, { state: "missing" }],
		]);
		const view = mount(PieceMap<State>({ groups, tones }));
		expect(pieces(view.host).map((p) => p.dataset.state)).toEqual([
			"missing",
			"missing",
		]);

		groups([[{ state: "have" }, { state: "coming" }]]);
		expect(pieces(view.host).map((p) => p.dataset.state)).toEqual([
			"have",
			"coming",
		]);
		view.dispose();
	});

	it("sizes its squares", () => {
		const view = mount(
			PieceMap<State>({ groups: [[{ state: "have" }]], tones, size: "lg" }),
		);
		expect(pieces(view.host)[0]?.classList.contains("size-3")).toBe(true);
		view.dispose();
	});
});

describe("PieceMapLegend", () => {
	it("keys each state with the map's own tone, after what it is given to say first", () => {
		const view = mount(
			PieceMapLegend<State>({
				tones,
				items: [
					{ state: "have", label: "Here" },
					{ state: "missing", label: "Missing" },
				],
				children: html`<span data-test="lead">56 MiB</span>`,
			}),
		);
		const legend = view.host.querySelector("[data-slot='piece-map-legend']");
		const swatches = [
			...view.host.querySelectorAll<HTMLElement>("[data-state]"),
		];

		expect(legend?.firstElementChild?.getAttribute("data-test")).toBe("lead");
		expect(legend?.textContent?.replace(/\s+/g, " ").trim()).toBe(
			"56 MiB Here Missing",
		);
		expect(swatches.map((s) => s.dataset.state)).toEqual(["have", "missing"]);
		expect(swatches[0]?.classList.contains("bg-primary")).toBe(true);
		expect(
			swatches.every((s) => s.getAttribute("aria-hidden") === "true"),
		).toBe(true);
		view.dispose();
	});
});
