/**
 * Chart — line, area and bar charts drawn as inline SVG.
 *
 * shadcn's Chart is a theming wrapper around Recharts. nebula cannot follow it
 * there — Recharts is React — and a zero-dependency port of a full charting
 * library is not a thing to promise. So the scope is stated plainly: three
 * chart types over one categorical axis and one numeric axis, which is what
 * the shadcn chart examples are and what dashboards overwhelmingly need.
 *
 * Anything beyond that — stacked bars with negative values, dual axes, brushes,
 * candlesticks, horizontal bars, heatmaps, funnels — is a charting library's
 * job, and an app needing one should install one rather than have this
 * component grow into a bad copy.
 *
 * The colours come from `--chart-1` … `--chart-5`, so a chart re-themes with
 * the rest of the design system instead of carrying its own palette.
 *
 * **Geometry.** Text is never stretched. The drawing is two SVGs in pixel
 * space — the value axis in a fixed gutter, the plot at full width — with
 * every horizontal position written as a percentage of the plot's width and
 * every vertical one in pixels. Only the curves and bars live in a nested SVG
 * stretched to the plot (`preserveAspectRatio="none"`), with strokes that do
 * not scale. Everything is an attribute: no `style` attribute, which a strict
 * Content-Security-Policy blocks, and the server's markup is the chart.
 *
 * **Missing values.** A value that is absent, `null` or not a finite number is
 * a gap: the line breaks, the area stops, no bar is drawn, and the table says
 * so. Drawing it as `0` would invent a number.
 *
 * **Reading it.** An SVG chart is invisible to a screen reader whatever ARIA is
 * put on it, so the same data is emitted as a real `<table>`, visually hidden.
 * The plot also takes focus: the arrow keys walk the categories, and what the
 * pointer or the keyboard points at is shown in a tooltip and announced in a
 * live region.
 */

import {
	component,
	html,
	onMount,
	onUnmount,
	signal,
	type TemplateResult,
} from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";

export interface ChartSeries {
	key: string;
	label: string;
	/** Any CSS colour. Defaults to `--chart-1`…`--chart-5` by position. */
	color?: string;
}

/** A category label as a datum may hold it. */
export type ChartCategory = string | number | Date;

/**
 * One row: a category plus one numeric value per series key. A value that is
 * missing, `null` or not a finite number is a gap.
 */
export type ChartDatum = Record<
	string,
	string | number | Date | null | undefined
>;

/** One end of the value axis: a number, or `"auto"` to fit the data. */
export type ChartBound = number | "auto";

export interface ChartProps {
	data: readonly ChartDatum[];
	series: readonly ChartSeries[];
	/** Key in each datum holding the category label. */
	categoryKey: string;
	type?: "line" | "area" | "bar";
	/** The chart's height in pixels, category labels included. Default `240`. */
	height?: number;
	/** Announced as the chart's name, and used as the data table's caption. */
	label: string;
	/** Draw a horizontal gridline at each value tick. Default `true`. */
	grid?: boolean;
	/**
	 * The value axis' range, `[min, max]`. Each end is a number, or `"auto"` to
	 * fit the data and round outwards to a tick. Default `["auto", "auto"]`.
	 */
	domain?: readonly [ChartBound, ChartBound];
	/**
	 * Stretch an `"auto"` end to include zero. Default `true`. Always on for
	 * bars: a bar is measured from zero, and one that starts elsewhere
	 * exaggerates every difference.
	 */
	zero?: boolean;
	/** Draw the smallest value at the top — a ranking, where 1 is best. */
	reversed?: boolean;
	/** About how many ticks the value axis gets. Default `5`. */
	tickCount?: number;
	/** Formats a value on the axis, in the tooltip and in the table. */
	formatValue?: (value: number) => string;
	/** Formats a category on the axis, in the tooltip and in the table. */
	formatCategory?: (category: ChartCategory) => string;
	/** BCP 47 locale for the default formatters. Default: the runtime's own. */
	locale?: string;
	class?: Reactive<string>;
}

/** Where the plot's drawing starts and stops, in pixels from its top. */
const PADDING = { top: 8, bottom: 24 };
/** Font size of every axis label, in pixels. */
const FONT_SIZE = 11;
/**
 * Average advance of one character at {@link FONT_SIZE}. An estimate — the
 * server cannot measure text — erring wide, so labels never touch.
 */
const CHARACTER_WIDTH = FONT_SIZE * 0.62;
/** Space kept between two category labels, in pixels. */
const LABEL_GAP = 8;
/**
 * The plot's width before it is measured: on the server, and until the first
 * resize report. Labels are thinned for this width, then for the real one.
 */
const NOMINAL_PLOT_WIDTH = 600;

function colorFor(series: ChartSeries, index: number): string {
	return series.color ?? `var(--chart-${(index % 5) + 1})`;
}

/** The value of `key`, or `null` for a gap. */
function numberAt(datum: ChartDatum, key: string): number | null {
	const value = datum[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function categoryAt(datum: ChartDatum, key: string): ChartCategory {
	const value = datum[key];
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		value instanceof Date
	) {
		return value;
	}
	return "";
}

/**
 * The range the data covers.
 *
 * Gaps are skipped. With `zero` (the default), the range always includes zero.
 * A flat range is widened — to `0`–`1` when it sits on zero, by a tenth of its
 * value either side otherwise — so there is always something to scale
 * against, and no data at all reads as `0`–`1`.
 */
export function valueRange(
	data: readonly ChartDatum[],
	series: readonly ChartSeries[],
	options: { zero?: boolean } = {},
): { min: number; max: number } {
	const zero = options.zero !== false;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const datum of data) {
		for (const entry of series) {
			const value = numberAt(datum, entry.key);
			if (value === null) continue;
			if (value < min) min = value;
			if (value > max) max = value;
		}
	}
	if (min > max) return { min: 0, max: 1 };
	if (zero) {
		min = Math.min(min, 0);
		max = Math.max(max, 0);
	}
	// Flat. With `zero` that can only be all zeros; without, a flat series
	// away from zero is centred in a band a fifth of its value wide.
	if (min === max) {
		if (min === 0) return { min: 0, max: 1 };
		const pad = Math.abs(min) * 0.1;
		return { min: min - pad, max: max + pad };
	}
	return { min, max };
}

/**
 * A "round" step near `raw`: 1, 2, 2.5 or 5 times a power of ten — the steps
 * a reader can add up in their head.
 */
function niceStep(raw: number): number {
	const exponent = Math.floor(Math.log10(raw));
	const magnitude = 10 ** exponent;
	const fraction = raw / magnitude;
	const nice =
		fraction <= 1
			? 1
			: fraction <= 2
				? 2
				: fraction <= 2.5
					? 2.5
					: fraction <= 5
						? 5
						: 10;
	return Number((nice * magnitude).toPrecision(12));
}

/** Drop floating-point dust: `0.30000000000000004` → `0.3`. */
function clean(value: number): number {
	return Number(value.toPrecision(12));
}

/**
 * Round ticks covering `min`–`max`, about `count` of them.
 *
 * The range is widened outwards to the nearest tick, so the first and last
 * ticks are the axis' ends.
 */
export function niceTicks(
	min: number,
	max: number,
	count = 5,
): { min: number; max: number; step: number; ticks: number[] } {
	let low = Math.min(min, max);
	let high = Math.max(min, max);
	if (!Number.isFinite(low) || !Number.isFinite(high)) {
		low = 0;
		high = 1;
	}
	if (low === high) {
		const pad = low === 0 ? 1 : Math.abs(low) * 0.1;
		low -= pad;
		high += pad;
	}
	const intervals = Math.max(1, Math.round(count) - 1);
	const step = niceStep((high - low) / intervals);
	const first = clean(Math.floor(low / step) * step);
	const last = clean(Math.ceil(high / step) * step);
	const ticks: number[] = [];
	for (let index = 0; ; index += 1) {
		const tick = clean(first + index * step);
		if (tick > last + step / 2) break;
		ticks.push(tick);
	}
	return { min: first, max: last, step, ticks };
}

export interface ValueAxisOptions {
	domain?: readonly [ChartBound, ChartBound];
	zero?: boolean;
	tickCount?: number;
}

/**
 * The value axis a chart draws: its ends and its ticks.
 *
 * An `"auto"` end fits the data and is rounded outwards to a tick. A number is
 * kept exactly and is a tick itself, with any round tick too close to it
 * dropped so the two labels do not collide.
 */
export function valueAxis(
	data: readonly ChartDatum[],
	series: readonly ChartSeries[],
	options: ValueAxisOptions = {},
): { min: number; max: number; ticks: number[] } {
	const [lowBound, highBound] = options.domain ?? ["auto", "auto"];
	const fitted = valueRange(data, series, { zero: options.zero });
	const fixedLow = typeof lowBound === "number" && Number.isFinite(lowBound);
	const fixedHigh = typeof highBound === "number" && Number.isFinite(highBound);
	let low = fixedLow ? lowBound : fitted.min;
	let high = fixedHigh ? highBound : fitted.max;
	// A fixed end beyond the data on the other side: keep the fixed end and
	// give the other one room.
	if (low >= high) {
		if (fixedLow && !fixedHigh) high = low + Math.abs(low || 1);
		else if (fixedHigh && !fixedLow) low = high - Math.abs(high || 1);
		else [low, high] = [Math.min(low, high), Math.max(low, high)];
	}
	const nice = niceTicks(low, high, options.tickCount);
	const min = fixedLow ? low : nice.min;
	const max = fixedHigh ? high : nice.max;
	if (min === max) return { min, max: max + 1, ticks: [min, max + 1] };
	const margin = nice.step / 2;
	const inside = nice.ticks.filter(
		(tick) =>
			tick >= min &&
			tick <= max &&
			!(fixedLow && tick !== min && tick - min < margin) &&
			!(fixedHigh && tick !== max && max - tick < margin),
	);
	const ticks = [
		...(fixedLow && !inside.includes(min) ? [min] : []),
		...inside,
		...(fixedHigh && !inside.includes(max) ? [max] : []),
	];
	return { min, max, ticks };
}

/**
 * Which category labels fit: every `step`-th one, the smallest step at which
 * the widest label no longer reaches its neighbour.
 */
export function visibleCategories(
	count: number,
	widestLabel: number,
	plotWidth: number,
): number[] {
	if (count === 0) return [];
	const slot = plotWidth / count;
	const step =
		slot <= 0
			? count
			: Math.max(1, Math.ceil((widestLabel + LABEL_GAP) / slot));
	const visible: number[] = [];
	for (let index = 0; index < count; index += step) visible.push(index);
	return visible;
}

export const Chart = component<ChartProps>((props) => {
	const titleId = uid("chart-title");
	const plotId = uid("chart-plot");
	const hintId = uid("chart-hint");
	const height = props.height ?? 240;
	const type = props.type ?? "line";
	const data = props.data;
	const series = props.series;
	const count = data.length;

	const numberFormat = new Intl.NumberFormat(props.locale);
	const dateFormat = new Intl.DateTimeFormat(props.locale, {
		dateStyle: "medium",
	});
	const formatValue =
		props.formatValue ?? ((value: number) => numberFormat.format(value));
	const formatCategory =
		props.formatCategory ??
		((category: ChartCategory) =>
			category instanceof Date
				? dateFormat.format(category)
				: String(category));

	const axis = valueAxis(data, series, {
		domain: props.domain,
		zero: type === "bar" || props.zero !== false,
		tickCount: props.tickCount,
	});
	const reversed = props.reversed === true;

	const top = PADDING.top;
	const bottom = height - PADDING.bottom;
	const plotHeight = Math.max(bottom - top, 1);

	/** Pixels from the top for `value`. */
	const y = (value: number): number => {
		const share = (value - axis.min) / (axis.max - axis.min);
		return top + (reversed ? share : 1 - share) * plotHeight;
	};
	/** Centre of category `index`, as a share of the plot's width. */
	const centre = (index: number): number =>
		count === 0 ? 0 : (index + 0.5) / count;
	const percent = (share: number): string => `${clean(share * 100)}%`;

	/** The line bars and areas grow from: zero when the axis shows it. */
	const baselineValue = Math.min(Math.max(0, axis.min), axis.max);
	const baseline = y(baselineValue);

	const tickLabels = axis.ticks.map((tick) => formatValue(tick));
	const gutter = Math.ceil(
		Math.max(...tickLabels.map((text) => text.length), 1) * CHARACTER_WIDTH +
			10,
	);
	const categoryLabels = data.map((datum) =>
		formatCategory(categoryAt(datum, props.categoryKey)),
	);
	const widestCategory =
		Math.max(...categoryLabels.map((text) => text.length), 0) * CHARACTER_WIDTH;

	const plotWidth = signal(NOMINAL_PLOT_WIDTH);
	/** The category the pointer or the keyboard points at. */
	const active = signal<number | undefined>(undefined);

	const valueText = (value: number | null): string =>
		value === null ? "—" : formatValue(value);

	/** What the tooltip shows and the live region says for `index`. */
	function describe(index: number): string {
		const datum = data[index];
		if (datum === undefined) return "";
		const values = series.map(
			(entry) => `${entry.label}: ${valueText(numberAt(datum, entry.key))}`,
		);
		return `${categoryLabels[index] ?? ""} — ${values.join(", ")}`;
	}

	let observer: ResizeObserver | undefined;
	onMount(() => {
		if (typeof ResizeObserver !== "function") return;
		const plot = document.getElementById(plotId);
		if (plot === null) return;
		observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width !== undefined && width > 0) plotWidth(width);
		});
		observer.observe(plot);
	});
	onUnmount(() => observer?.disconnect());

	function pointAt(event: PointerEvent): void {
		const plot = event.currentTarget;
		if (!(plot instanceof Element) || count === 0) return;
		const box = plot.getBoundingClientRect();
		if (box.width <= 0) return;
		const share = (event.clientX - box.left) / box.width;
		active(Math.min(count - 1, Math.max(0, Math.floor(share * count))));
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (count === 0) return;
		const current = active();
		let next: number | undefined;
		switch (event.key) {
			case "ArrowRight":
			case "ArrowDown":
				next = current === undefined ? 0 : Math.min(count - 1, current + 1);
				break;
			case "ArrowLeft":
			case "ArrowUp":
				next = current === undefined ? count - 1 : Math.max(0, current - 1);
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = count - 1;
				break;
			case "Escape":
				if (current === undefined) return;
				active(undefined);
				event.preventDefault();
				return;
			default:
				return;
		}
		event.preventDefault();
		active(next);
	}

	return html`<figure
		data-slot="chart"
		class="${() => cn("w-full", read(props.class))}"
	>
		<div class="flex w-full">
			<svg
				data-slot="chart-value-axis"
				aria-hidden="true"
				focusable="false"
				width="${gutter}"
				height="${height}"
				class="shrink-0 overflow-visible"
			>${axis.ticks.map(
				(tick, index) => html`<g><text
					x="${gutter - 6}"
					y="${y(tick)}"
					text-anchor="end"
					dominant-baseline="middle"
					font-size="${FONT_SIZE}"
					fill="var(--muted-foreground)"
				>${tickLabels[index]}</text></g>`,
			)}</svg>
			<div
				id="${plotId}"
				data-slot="chart-plot"
				role="group"
				aria-roledescription="chart"
				aria-labelledby="${titleId}"
				aria-describedby="${hintId}"
				tabindex="0"
				class="focus-visible:ring-ring/50 relative min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-[3px]"
				@pointermove="${pointAt}"
				@pointerdown="${pointAt}"
				@pointerleave="${() => active(undefined)}"
				@keydown="${onKeyDown}"
				@blur="${() => active(undefined)}"
			>
				<svg
					aria-hidden="true"
					focusable="false"
					width="100%"
					height="${height}"
					class="block overflow-visible"
				>
					${props.grid === false ? null : axis.ticks.map(renderGridline)}
					<svg
						x="0"
						y="${top - 4}"
						width="100%"
						height="${plotHeight + 8}"
						viewBox="${`0 ${top - 4} ${Math.max(count, 1)} ${plotHeight + 8}`}"
						preserveAspectRatio="none"
					>${series.map((entry, index) =>
						type === "bar"
							? renderBars(entry, index)
							: renderCurve(entry, index),
					)}</svg>
					${type === "bar" ? null : series.map(renderLonePoints)}
					${() =>
						visibleCategories(count, widestCategory, plotWidth()).map(
							(index) => html`<g><text
								x="${percent(centre(index))}"
								y="${height - 6}"
								text-anchor="middle"
								font-size="${FONT_SIZE}"
								fill="var(--muted-foreground)"
							>${categoryLabels[index]}</text></g>`,
						)}
					${() => renderMarker(active())}
				</svg>
				${() => renderTooltip(active())}
			</div>
		</div>
		<span id="${titleId}" class="sr-only">${props.label}</span>
		<span id="${hintId}" class="sr-only">${
			count === 0 ? "" : "Arrow keys read each category."
		}</span>
		<div role="status" aria-live="polite" class="sr-only">${() => {
			const index = active();
			return index === undefined ? "" : describe(index);
		}}</div>
		<figcaption class="sr-only">${renderDataTable()}</figcaption>
		<div data-slot="chart-legend" class="mt-2 flex flex-wrap justify-center gap-4 text-xs">
			${series.map(
				(entry, index) => html`<span class="flex items-center gap-1.5">
					${swatch(colorFor(entry, index))}
					<span class="text-muted-foreground">${entry.label}</span>
				</span>`,
			)}
		</div>
	</figure>`;

	function swatch(color: string): TemplateResult {
		return html`<svg
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 8 8"
			class="size-2 shrink-0"
		><rect width="8" height="8" rx="2" fill="${color}" /></svg>`;
	}

	function renderGridline(tick: number): TemplateResult {
		return html`<g><line
			x1="0"
			x2="100%"
			y1="${y(tick)}"
			y2="${y(tick)}"
			stroke="var(--border)"
			stroke-width="1"
		/></g>`;
	}

	/**
	 * The runs of consecutive values, each one an unbroken stretch of line. A
	 * gap ends a run; nothing is drawn across it.
	 */
	function runsOf(entry: ChartSeries): { index: number; value: number }[][] {
		const runs: { index: number; value: number }[][] = [];
		let run: { index: number; value: number }[] = [];
		data.forEach((datum, index) => {
			const value = numberAt(datum, entry.key);
			if (value === null) {
				if (run.length > 0) runs.push(run);
				run = [];
				return;
			}
			run.push({ index, value });
		});
		if (run.length > 0) runs.push(run);
		return runs;
	}

	function renderCurve(entry: ChartSeries, index: number): TemplateResult {
		const color = colorFor(entry, index);
		const runs = runsOf(entry);
		const line = runs
			.map((run) =>
				run
					.map(
						(point, at) =>
							`${at === 0 ? "M" : "L"}${clean(point.index + 0.5)},${clean(y(point.value))}`,
					)
					.join(" "),
			)
			.join(" ");
		const area = runs
			.filter((run) => run.length > 1)
			.map((run) => {
				const first = run[0];
				const last = run[run.length - 1];
				if (first === undefined || last === undefined) return "";
				const path = run
					.map(
						(point, at) =>
							`${at === 0 ? "M" : "L"}${clean(point.index + 0.5)},${clean(y(point.value))}`,
					)
					.join(" ");
				return `${path} L${clean(last.index + 0.5)},${clean(baseline)} L${clean(first.index + 0.5)},${clean(baseline)} Z`;
			})
			.join(" ");
		return html`<g data-series="${entry.key}">
			${
				type === "area" && area !== ""
					? html`<path d="${area}" fill="${color}" fill-opacity="0.15" />`
					: null
			}
			<path
				d="${line}"
				fill="none"
				stroke="${color}"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				vector-effect="non-scaling-stroke"
			/>
		</g>`;
	}

	/**
	 * A value with a gap on both sides has no segment to be part of; drawn as a
	 * line it would be invisible. A dot shows it exists.
	 */
	function renderLonePoints(entry: ChartSeries, index: number): TemplateResult {
		const lone = runsOf(entry).filter((run) => run.length === 1);
		return html`<g data-lone="${entry.key}" fill="${colorFor(entry, index)}">${lone.map(
			(run) => {
				const point = run[0];
				if (point === undefined) return null;
				return html`<circle
					cx="${percent(centre(point.index))}"
					cy="${y(point.value)}"
					r="2.5"
				/>`;
			},
		)}</g>`;
	}

	function renderBars(entry: ChartSeries, seriesIndex: number): TemplateResult {
		// Share each slot between the series so grouped bars sit side by side,
		// with a quarter of the slot left as the gap between groups.
		const barWidth = 0.75 / Math.max(series.length, 1);
		return html`<g data-series="${entry.key}" fill="${colorFor(entry, seriesIndex)}">
			${data.map((datum, index) => {
				const value = numberAt(datum, entry.key);
				if (value === null) return null;
				const tip = y(value);
				return html`<rect
					x="${clean(index + 0.125 + barWidth * seriesIndex)}"
					y="${clean(Math.min(tip, baseline))}"
					width="${clean(barWidth)}"
					height="${clean(Math.abs(baseline - tip))}"
				/>`;
			})}
		</g>`;
	}

	/** The guide under the pointer, and a dot on each value it crosses. */
	function renderMarker(index: number | undefined): TemplateResult | null {
		const datum = index === undefined ? undefined : data[index];
		if (index === undefined || datum === undefined) return null;
		const x = percent(centre(index));
		return html`<g data-slot="chart-marker">
			<line
				x1="${x}"
				x2="${x}"
				y1="${top}"
				y2="${bottom}"
				stroke="var(--muted-foreground)"
				stroke-width="1"
				stroke-dasharray="3 3"
			/>
			${
				type === "bar"
					? null
					: series.map((entry, seriesIndex) => {
							const value = numberAt(datum, entry.key);
							if (value === null) return null;
							return html`<circle
								cx="${x}"
								cy="${y(value)}"
								r="4"
								fill="${colorFor(entry, seriesIndex)}"
								stroke="var(--background)"
								stroke-width="2"
							/>`;
						})
			}
		</g>`;
	}

	/**
	 * The values at the pointed category. Hidden from assistive technology —
	 * the live region says the same — and placed through `.style`, which goes
	 * through the CSSOM: a `style` attribute would be blocked by a strict CSP.
	 */
	function renderTooltip(index: number | undefined): TemplateResult | null {
		const datum = index === undefined ? undefined : data[index];
		if (index === undefined || datum === undefined) return null;
		const share = centre(index);
		const side =
			share < 0.2
				? "translate-x-2"
				: share > 0.8
					? "-translate-x-full -ml-2"
					: "-translate-x-1/2";
		return html`<div
			data-slot="chart-tooltip"
			aria-hidden="true"
			class="${cn(
				"bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 grid min-w-32 gap-1 rounded-md border px-2.5 py-1.5 text-xs shadow-md",
				side,
			)}"
			.style="${`left:${percent(share)}`}"
		>
			<div class="font-medium">${categoryLabels[index]}</div>
			${series.map(
				(entry, seriesIndex) => html`<div class="flex items-center gap-1.5">
					${swatch(colorFor(entry, seriesIndex))}
					<span class="text-muted-foreground">${entry.label}</span>
					<span class="ml-auto font-mono font-medium tabular-nums">${valueText(
						numberAt(datum, entry.key),
					)}</span>
				</div>`,
			)}
		</div>`;
	}

	/** The same numbers as a real table, for anything that cannot see the SVG. */
	function renderDataTable(): TemplateResult {
		return html`<table>
			<caption>${props.label}</caption>
			<thead>
				<tr>
					<th scope="col">${props.categoryKey}</th>
					${series.map((entry) => html`<th scope="col">${entry.label}</th>`)}
				</tr>
			</thead>
			<tbody>
				${data.map(
					(datum, index) => html`<tr>
						<th scope="row">${categoryLabels[index]}</th>
						${series.map(
							(entry) =>
								html`<td>${valueText(numberAt(datum, entry.key))}</td>`,
						)}
					</tr>`,
				)}
			</tbody>
		</table>`;
	}
});
