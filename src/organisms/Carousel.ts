/**
 * Carousel — a horizontally scrolling strip of slides.
 *
 * shadcn wraps `embla-carousel`, which animates a transform with its own
 * requestAnimationFrame loop and reimplements drag physics on top. nebula uses
 * CSS scroll-snap and `scrollBy`.
 *
 * That is not only smaller, it is better behaved. Native scrolling brings
 * touch momentum, trackpad gestures, the platform's own overscroll, and
 * keyboard scrolling — all things a transform-based carousel has to rebuild
 * and usually gets partly wrong. `scroll-behavior: smooth` handles the
 * animation, and `prefers-reduced-motion` turns it off without a branch here.
 *
 * The strip is a `region` with `aria-roledescription="carousel"`, and slides
 * are `group`s labelled "N of M". A screen reader user otherwise has no way to
 * tell how much is off-screen — the visual affordance of a strip running off
 * the edge carries none of that.
 */

import {
	component,
	createContext,
	html,
	inject,
	onMount,
	onUnmount,
	provide,
	signal,
} from "@c9up/aurora";
import { buttonVariants } from "../atoms/Button.js";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { ArrowLeftIcon, ArrowRightIcon } from "../lib/icons.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

interface CarouselApi {
	readonly trackId: string;
	readonly horizontal: boolean;
	readonly atStart: () => boolean;
	readonly atEnd: () => boolean;
	/** Claim the next slide's position, for its "n of m" label. */
	claimSlide(): number;
	readonly slideCount: () => number;
	scrollByPage(direction: 1 | -1): void;
	syncEdges(): void;
}

const CarouselContext = createContext<CarouselApi>("Carousel");

export interface CarouselProps {
	/** Announced before the slides. */
	label?: string;
	orientation?: "horizontal" | "vertical";
	class?: Reactive<string>;
	children?: Parts;
}

export const Carousel = component<CarouselProps>((props) => {
	const trackId = uid("carousel-track");
	const horizontal = props.orientation !== "vertical";
	const atStart = signal(true);
	const atEnd = signal(false);
	let slides = 0;

	function track(): HTMLElement | null {
		return document.getElementById(trackId);
	}

	/**
	 * Which arrows are usable, read from the scroll position.
	 *
	 * Derived rather than tracked: the track is a scroll container, so a drag,
	 * a wheel, a trackpad swipe and the buttons all move it, and only the
	 * element knows where it ended up.
	 */
	function syncEdges(): void {
		const element = track();
		if (element === null) return;
		const position = horizontal ? element.scrollLeft : element.scrollTop;
		const total = horizontal ? element.scrollWidth : element.scrollHeight;
		const visible = horizontal ? element.clientWidth : element.clientHeight;
		atStart(position <= 1);
		atEnd(position + visible >= total - 1);
	}

	function scrollByPage(direction: 1 | -1): void {
		const element = track();
		if (element === null) return;
		const distance =
			(horizontal ? element.clientWidth : element.clientHeight) * direction;
		element.scrollBy(
			horizontal
				? { left: distance, behavior: "smooth" }
				: { top: distance, behavior: "smooth" },
		);
	}

	function onKeyDown(event: KeyboardEvent): void {
		const back = horizontal ? "ArrowLeft" : "ArrowUp";
		const forward = horizontal ? "ArrowRight" : "ArrowDown";
		if (event.key === back) {
			event.preventDefault();
			scrollByPage(-1);
		} else if (event.key === forward) {
			event.preventDefault();
			scrollByPage(1);
		}
	}

	onMount(() => {
		syncEdges();
		const element = track();
		element?.addEventListener("scroll", syncEdges, { passive: true });
		window.addEventListener("resize", syncEdges);
	});

	onUnmount(() => {
		track()?.removeEventListener("scroll", syncEdges);
		window.removeEventListener("resize", syncEdges);
	});

	provide<CarouselApi>(CarouselContext, {
		trackId,
		horizontal,
		atStart: () => atStart(),
		atEnd: () => atEnd(),
		claimSlide() {
			slides += 1;
			return slides;
		},
		slideCount: () => slides,
		scrollByPage,
		syncEdges,
	});

	return html`<div
		data-slot="carousel"
		role="region"
		aria-roledescription="carousel"
		aria-label="${props.label ?? "Carousel"}"
		class="${() => cn("relative", read(props.class))}"
		@keydown="${onKeyDown}"
	>${props.children?.()}</div>`;
});

export interface CarouselContentProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** The scroll container. */
export const CarouselContent = component<CarouselContentProps>((props) => {
	const carousel = inject(CarouselContext);
	return html`<div
		data-slot="carousel-content"
		id="${carousel.trackId}"
		tabindex="0"
		class="${() =>
			cn(
				"flex snap-mandatory gap-4 overflow-auto scroll-smooth outline-none motion-reduce:scroll-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				carousel.horizontal ? "snap-x flex-row" : "snap-y max-h-96 flex-col",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`;
});

export interface CarouselItemProps {
	children?: Slot;
	class?: Reactive<string>;
}

/**
 * One slide.
 *
 * Claims its position as it is built, which is what `"3 of 7"` needs — and the
 * count is only final once every slide has been built, so the label reads it
 * lazily rather than capturing it.
 */
export const CarouselItem = component<CarouselItemProps>((props) => {
	const carousel = inject(CarouselContext);
	const position = carousel.claimSlide();
	return html`<div
		data-slot="carousel-item"
		role="group"
		aria-roledescription="slide"
		aria-label="${() => `${position} of ${carousel.slideCount()}`}"
		class="${() =>
			cn("min-w-0 shrink-0 grow-0 basis-full snap-start", read(props.class))}"
	>${slot(props.children)}</div>`;
});

export interface CarouselButtonProps {
	class?: Reactive<string>;
}

const arrowClasses = "absolute size-8 rounded-full";

export const CarouselPrevious = component<CarouselButtonProps>((props) => {
	const carousel = inject(CarouselContext);
	return html`<button
		type="button"
		data-slot="carousel-previous"
		aria-label="Previous slide"
		?disabled="${() => carousel.atStart()}"
		class="${() =>
			cn(
				buttonVariants({ variant: "outline", size: "icon" }),
				arrowClasses,
				carousel.horizontal
					? "top-1/2 -left-12 -translate-y-1/2"
					: "-top-12 left-1/2 -translate-x-1/2 rotate-90",
				read(props.class),
			)}"
		@click="${() => carousel.scrollByPage(-1)}"
	>${ArrowLeftIcon({ class: "size-4" })}</button>`;
});

export const CarouselNext = component<CarouselButtonProps>((props) => {
	const carousel = inject(CarouselContext);
	return html`<button
		type="button"
		data-slot="carousel-next"
		aria-label="Next slide"
		?disabled="${() => carousel.atEnd()}"
		class="${() =>
			cn(
				buttonVariants({ variant: "outline", size: "icon" }),
				arrowClasses,
				carousel.horizontal
					? "top-1/2 -right-12 -translate-y-1/2"
					: "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
				read(props.class),
			)}"
		@click="${() => carousel.scrollByPage(1)}"
	>${ArrowRightIcon({ class: "size-4" })}</button>`;
});
