/**
 * Progress — a determinate progress bar.
 *
 * The fill is a full-width shape translated left by the remaining percentage,
 * rather than a width animation. Transforms are composited off the main
 * thread; animating `width` relayouts the bar on every frame, which is visible
 * on a long upload.
 *
 * The shape is an SVG `<rect>` moved by its `transform` ATTRIBUTE, not a `<div>`
 * moved by a `style` attribute. A Content-Security-Policy without
 * `'unsafe-inline'` blocks every `style` attribute; an SVG presentation
 * attribute is not a style attribute and passes. A `.style` property would pass
 * too, but the server does not write properties, so the bar would read full
 * until hydration — the attribute is in the server's markup, right from the
 * first paint.
 *
 * A `value` of `null` means indeterminate, and drops `aria-valuenow` — the
 * ARIA spec is explicit that an absent value is how "unknown progress" is
 * expressed, and reporting `0` instead tells the user it has not started.
 */

import { component, html } from "@c9up/aurora";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

export interface ProgressProps {
	/** `0`–`max`, or `null` for indeterminate. */
	value?: Reactive<number | null>;
	max?: Reactive<number>;
	label?: Reactive<string | undefined>;
	class?: Reactive<string>;
}

export const Progress = component<ProgressProps>((props) => {
	const max = (): number => {
		const given = readOr(props.max, 100);
		// A zero or negative maximum would make the percentage infinite or
		// negative and push the fill off the track in one direction or the other.
		return given > 0 ? given : 100;
	};

	const value = (): number | null => {
		const given = readOr(props.value, 0);
		if (given === null) return null;
		return Math.min(Math.max(given, 0), max());
	};

	const percent = (): number => {
		const current = value();
		return current === null ? 0 : (current / max()) * 100;
	};

	return html`<div
		data-slot="progress"
		role="progressbar"
		aria-valuemin="0"
		aria-valuemax="${max}"
		aria-valuenow="${() => value() ?? undefined}"
		aria-label="${() => read(props.label)}"
		class="${() =>
			cn(
				"bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
				read(props.class),
			)}"
	>
<svg
			data-slot="progress-indicator"
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 100 1"
			preserveAspectRatio="none"
			class="fill-primary block h-full w-full"
		><rect
				width="100"
				height="1"
				transform="${() => `translate(${percent() - 100} 0)`}"
				class="transition-transform"
			/></svg>
	</div>`;
});
