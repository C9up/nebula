/**
 * Every text a component writes on its own can be replaced.
 *
 * Most are read only by a screen reader — a close cross, a page arrow, a
 * landmark name — so an app in French that could not reach them served a page
 * that switched to English mid-sentence for exactly the users who cannot see
 * it. Upstream (shadcn) writes these strings in a file the app owns and edits;
 * nebula is also a package, so each one is a prop, defaulting to upstream's
 * English.
 */

import { html } from "@c9up/aurora";
import { afterEach, describe, expect, it } from "vitest";
import {
	Breadcrumb,
	BreadcrumbEllipsis,
} from "../../src/molecules/Breadcrumb.js";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "../../src/molecules/InputOTP.js";
import {
	Pagination,
	PaginationEllipsis,
	PaginationNext,
	PaginationPrevious,
} from "../../src/molecules/Pagination.js";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "../../src/molecules/Resizable.js";
import { Calendar } from "../../src/organisms/Calendar.js";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "../../src/organisms/Carousel.js";
import { Chart } from "../../src/organisms/Chart.js";
import { type Column, DataTable } from "../../src/organisms/DataTable.js";
import { DatePicker } from "../../src/organisms/DatePicker.js";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "../../src/organisms/Dialog.js";
import { Questionnaire } from "../../src/organisms/Questionnaire.js";
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "../../src/organisms/Sheet.js";
import {
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from "../../src/organisms/Sidebar.js";
import { Toaster, toast } from "../../src/organisms/Toaster.js";
import { SettingsLayout } from "../../src/templates/SettingsLayout.js";
import { type Mounted, mount, portalContent } from "./helpers.js";

let view: Mounted | undefined;

function show(template: Parameters<typeof mount>[0]): HTMLElement {
	view = mount(template);
	return view.host;
}

afterEach(() => {
	view?.dispose();
	view = undefined;
});

function label(root: ParentNode, selector: string): string | null | undefined {
	return root.querySelector(selector)?.getAttribute("aria-label");
}

function text(root: ParentNode, selector: string): string | undefined {
	return root.querySelector(selector)?.textContent?.trim();
}

describe("nebula > Pagination labels", () => {
	function pager(french: boolean): HTMLElement {
		return show(
			Pagination({
				"aria-label": french ? "Pages des résultats" : undefined,
				children: html`${PaginationPrevious({
					"aria-label": french ? "Page précédente" : undefined,
					children: french ? "Précédent" : undefined,
				})}${PaginationEllipsis({ label: french ? "Autres pages" : undefined })}${PaginationNext(
					{
						"aria-label": french ? "Page suivante" : undefined,
						children: french ? "Suivant" : undefined,
					},
				)}`,
			}),
		);
	}

	it("defaults to upstream's English", () => {
		const host = pager(false);
		expect(label(host, "nav")).toBe("pagination");
		expect(label(host, "[aria-label^='Go to previous']")).toBe(
			"Go to previous page",
		);
		expect(text(host, "a:first-of-type span")).toBe("Previous");
		expect(text(host, "[data-slot=pagination-ellipsis] .sr-only")).toBe(
			"More pages",
		);
	});

	it("takes the accessible name and the visible word, keeping the arrows", () => {
		const host = pager(true);
		expect(label(host, "nav")).toBe("Pages des résultats");
		const links = [...host.querySelectorAll("a")];
		expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
			"Page précédente",
			"Page suivante",
		]);
		expect(links.map((link) => link.textContent?.trim())).toEqual([
			"Précédent",
			"Suivant",
		]);
		expect(links.every((link) => link.querySelector("svg") !== null)).toBe(
			true,
		);
		expect(text(host, "[data-slot=pagination-ellipsis] .sr-only")).toBe(
			"Autres pages",
		);
	});
});

describe("nebula > Breadcrumb labels", () => {
	it("names the landmark and the ellipsis", () => {
		const host = show(
			Breadcrumb({
				"aria-label": "fil d'Ariane",
				children: BreadcrumbEllipsis({ label: "Plus" }),
			}),
		);
		expect(label(host, "nav")).toBe("fil d'Ariane");
		expect(text(host, ".sr-only")).toBe("Plus");
	});
});

describe("nebula > close buttons", () => {
	it("names the Dialog's cross and its footer button", () => {
		show(
			Dialog({
				children: () =>
					html`${DialogTrigger({ children: "Ouvrir" })}${DialogContent({
						closeLabel: "Fermer",
						children: () =>
							html`${DialogTitle({ children: "Titre" })}${DialogFooter({
								showCloseButton: true,
								closeLabel: "Annuler",
							})}`,
					})}`,
			}),
		);
		document.querySelector<HTMLElement>("[data-slot=dialog-trigger]")?.click();
		const surface = portalContent();
		const buttons = [
			...(surface?.querySelectorAll("[data-slot=dialog-close]") ?? []),
		];
		expect(buttons.map((button) => button.textContent?.trim())).toEqual([
			"Annuler",
			"Fermer",
		]);
	});

	it("names the Sheet's cross", () => {
		show(
			Sheet({
				children: () =>
					html`${SheetTrigger({ children: "Ouvrir" })}${SheetContent({
						closeLabel: "Fermer",
						children: () => SheetTitle({ children: "Titre" }),
					})}`,
			}),
		);
		document.querySelector<HTMLElement>("[data-slot=sheet-trigger]")?.click();
		expect(text(document, "[data-slot=sheet-close] .sr-only")).toBe("Fermer");
	});
});

describe("nebula > Sidebar labels", () => {
	it("names the trigger and the rail", () => {
		const host = show(
			SidebarProvider({
				children: () =>
					html`${SidebarTrigger({ label: "Afficher le menu" })}${SidebarRail({
						label: "Replier le menu",
					})}`,
			}),
		);
		expect(label(host, "[data-slot=sidebar-trigger], button")).toBe(
			"Afficher le menu",
		);
		const rail = host.querySelector("[data-slot=sidebar-rail]");
		expect(rail?.getAttribute("aria-label")).toBe("Replier le menu");
		expect(rail?.getAttribute("title")).toBe("Replier le menu");
	});
});

describe("nebula > DataTable labels", () => {
	interface Member {
		name: string;
	}
	const columns: readonly Column<Member>[] = [{ key: "name", header: "Nom" }];
	const rows = Array.from({ length: 30 }, (_, i) => ({ name: `m${i}` }));

	it("names the selection boxes and its pager", () => {
		const host = show(
			DataTable({
				columns,
				rows,
				rowKey: (row) => row.name,
				pageSize: 5,
				selectable: true,
				selectAllLabel: "Tout sélectionner sur cette page",
				selectRowLabel: (row) => `Sélectionner ${row.name}`,
				paginationLabels: { previous: "Précédent", nextPage: "Page suivante" },
			}),
		);
		const boxes = [...host.querySelectorAll("input[type=checkbox]")];
		expect(boxes[0]?.getAttribute("aria-label")).toBe(
			"Tout sélectionner sur cette page",
		);
		expect(boxes[1]?.getAttribute("aria-label")).toBe("Sélectionner m0");
		const links = [...host.querySelectorAll("[data-slot=pagination-link]")];
		expect(links[0]?.textContent?.trim()).toBe("Précédent");
		// A key left out keeps its default.
		expect(links[0]?.getAttribute("aria-label")).toBe("Go to previous page");
		expect(links.at(-1)?.getAttribute("aria-label")).toBe("Page suivante");
	});
});

describe("nebula > Carousel labels", () => {
	it("names the region, the slides and the arrows", () => {
		const host = show(
			Carousel({
				roleDescription: "carrousel",
				children: () =>
					html`${CarouselContent({
						children: html`${CarouselItem({
							roleDescription: "diapositive",
							label: (position, count) => `${position} sur ${count}`,
							children: "Une",
						})}${CarouselItem({ children: "Deux" })}`,
					})}${CarouselPrevious({ label: "Précédente" })}${CarouselNext({})}`,
			}),
		);
		expect(
			host
				.querySelector("[data-slot=carousel]")
				?.getAttribute("aria-roledescription"),
		).toBe("carrousel");
		const slides = [...host.querySelectorAll("[data-slot=carousel-item]")];
		expect(slides.map((slide) => slide.getAttribute("aria-label"))).toEqual([
			"1 sur 2",
			"2 of 2",
		]);
		expect(slides[0]?.getAttribute("aria-roledescription")).toBe("diapositive");
		expect(label(host, "[data-slot=carousel-previous]")).toBe("Précédente");
		expect(label(host, "[data-slot=carousel-next]")).toBe("Next slide");
	});
});

describe("nebula > Calendar and DatePicker labels", () => {
	it("names the month arrows", () => {
		const host = show(
			Calendar({
				locale: "fr-CH",
				labels: { previousMonth: "Mois précédent", nextMonth: "Mois suivant" },
			}),
		);
		const arrows = [...host.querySelectorAll("button[aria-label]")].slice(0, 2);
		expect(arrows.map((arrow) => arrow.getAttribute("aria-label"))).toEqual([
			"Mois précédent",
			"Mois suivant",
		]);
	});

	it("names the popup and hands the calendar its words", () => {
		show(
			DatePicker({
				defaultValue: new Date(2026, 5, 10),
				labels: { dialog: "Choisir une date", previousMonth: "Mois précédent" },
			}),
		);
		document
			.querySelector<HTMLElement>("[data-slot=date-picker-trigger]")
			?.click();
		const popup = document.querySelector("[data-slot=date-picker-content]");
		expect(popup?.getAttribute("aria-label")).toBe("Choisir une date");
		expect(
			popup?.querySelector("button[aria-label]")?.getAttribute("aria-label"),
		).toBe("Mois précédent");
	});
});

describe("nebula > the remaining labels", () => {
	it("InputOTP names each box from its position", () => {
		const host = show(
			InputOTP({
				length: 2,
				slotLabel: (position, length) => `Chiffre ${position} sur ${length}`,
				children: () =>
					InputOTPGroup({ children: [InputOTPSlot({}), InputOTPSlot({})] }),
			}),
		);
		expect(
			[...host.querySelectorAll("input[data-otp-index]")].map((box) =>
				box.getAttribute("aria-label"),
			),
		).toEqual(["Chiffre 1 sur 2", "Chiffre 2 sur 2"]);
	});

	it("ResizableHandle names the separator", () => {
		const host = show(
			ResizablePanelGroup({
				children: () =>
					html`${ResizablePanel({ children: "A" })}${ResizableHandle({
						label: "Redimensionner",
					})}${ResizablePanel({ children: "B" })}`,
			}),
		);
		expect(label(host, "[role=separator]")).toBe("Redimensionner");
	});

	it("Questionnaire names its progress and counts in the app's words", () => {
		const host = show(
			Questionnaire({
				questions: [
					{ id: "a", type: "text", prompt: "Nom ?" },
					{ id: "b", type: "text", prompt: "Ville ?" },
				],
				onComplete: () => {},
				progressLabel: "Progression",
				counterLabel: (position, total) => `Question ${position} sur ${total}`,
			}),
		);
		expect(label(host, "[role=progressbar]")).toBe("Progression");
		expect(host.textContent).toContain("Question 1 sur 2");
	});

	it("SettingsLayout names its section list", () => {
		const host = show(
			SettingsLayout({
				title: "Réglages",
				sections: [{ label: "Profil", href: "#profil", active: true }],
				navLabel: "Rubriques",
			}),
		);
		expect(label(host, "[data-slot=settings-nav]")).toBe("Rubriques");
	});

	it("Chart names its plot and tells how to read it", () => {
		const host = show(
			Chart({
				label: "Visites",
				categoryKey: "mois",
				data: [{ mois: "janv.", visites: 3 }],
				series: [{ key: "visites", label: "Visites" }],
				roleDescription: "graphique",
				keyboardHint: "Les flèches lisent chaque catégorie.",
			}),
		);
		const plot = host.querySelector("[data-slot=chart-plot]");
		expect(plot?.getAttribute("aria-roledescription")).toBe("graphique");
		expect(
			document.getElementById(plot?.getAttribute("aria-describedby") ?? "")
				?.textContent,
		).toBe("Les flèches lisent chaque catégorie.");
	});

	it("Toaster names the dismiss cross", () => {
		const host = show(
			Toaster({ closeButtonAriaLabel: "Fermer la notification" }),
		);
		const id = toast.success("Enregistré");
		expect(label(host, "[data-slot=toast] button")).toBe(
			"Fermer la notification",
		);
		toast.dismiss(id);
	});
});
