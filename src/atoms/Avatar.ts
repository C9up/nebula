/**
 * Avatar — a user's picture, with a fallback when there is none.
 *
 *   Avatar({ children: () => html`
 *     ${AvatarImage({ src: user.photo, alt: user.name })}
 *     ${AvatarFallback({ children: initials })}
 *   ` })
 *
 * Three states, not two. An image that has not loaded *yet* must not show the
 * fallback — swapping initials in and a photo over them a moment later is the
 * flicker this component exists to avoid. So the fallback appears only once
 * the image has actually failed, or when there is no `AvatarImage` at all.
 *
 * That is what the context carries: the image reports its own load state up,
 * the fallback reads it, and neither knows the other exists. Radix needs the
 * same three pieces for the same reason.
 */

import {
	component,
	createContext,
	html,
	inject,
	provide,
	signal,
} from "@c9up/aurora";
import type { Parts, Slot } from "../lib/children.js";
import { slot } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { type Reactive, read, readOr } from "../lib/props.js";

type LoadState = "absent" | "pending" | "loaded" | "failed";

interface AvatarApi {
	readonly state: () => LoadState;
	setState(next: LoadState): void;
}

const AvatarContext = createContext<AvatarApi>("Avatar");

export interface AvatarProps {
	size?: "sm" | "default" | "lg";
	class?: Reactive<string>;
	children?: Parts;
}

export const Avatar = component<AvatarProps>((props) => {
	// `absent` until an image says otherwise: an avatar with no `AvatarImage`
	// is a fallback-only avatar, and it must not wait for a load that will
	// never happen.
	const state = signal<LoadState>("absent");

	provide<AvatarApi>(AvatarContext, {
		state: () => state(),
		setState: (next) => state(next),
	});

	return html`<span
		data-slot="avatar"
		data-size="${props.size ?? "default"}"
		class="${() =>
			cn(
				"group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
				read(props.class),
			)}"
	>${props.children?.()}</span>`;
});

export interface AvatarImageProps {
	src?: Reactive<string | undefined>;
	alt?: Reactive<string>;
	class?: Reactive<string>;
}

export const AvatarImage = component<AvatarImageProps>((props) => {
	const avatar = inject(AvatarContext);

	const hasSrc = (): boolean => {
		const src = read(props.src);
		return src !== undefined && src !== "";
	};

	// Reported during setup, so the fallback built after it already reads the
	// right state rather than flashing through `absent`.
	avatar.setState(hasSrc() ? "pending" : "absent");

	return html`${() =>
		hasSrc() && avatar.state() !== "failed"
			? html`<img
					data-slot="avatar-image"
					src="${() => read(props.src)}"
					alt="${() => readOr(props.alt, "")}"
					class="${() => cn("aspect-square size-full object-cover", read(props.class))}"
					@load="${() => avatar.setState("loaded")}"
					@error="${() => avatar.setState("failed")}"
				/>`
			: null}`;
});

export interface AvatarFallbackProps {
	children?: Slot;
	class?: Reactive<string>;
}

export const AvatarFallback = component<AvatarFallbackProps>((props) => {
	const avatar = inject(AvatarContext);
	const show = (): boolean => {
		const state = avatar.state();
		return state === "absent" || state === "failed";
	};
	return html`${() =>
		show()
			? html`<span
					data-slot="avatar-fallback"
					class="${() =>
						cn(
							"bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs",
							read(props.class),
						)}"
				>${slot(props.children)}</span>`
			: null}`;
});

export interface AvatarBadgeProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** A status dot in the corner — online, unread, verified. */
export const AvatarBadge = component<AvatarBadgeProps>(
	(props) => html`<span
		data-slot="avatar-badge"
		class="${() =>
			cn(
				"bg-primary text-primary-foreground ring-background absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full ring-2 select-none",
				"group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
				"group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
				"group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
				read(props.class),
			)}"
	>${slot(props.children)}</span>`,
);

export interface AvatarGroupProps {
	children?: Slot;
	class?: Reactive<string>;
}

/** Overlapping avatars, each ringed so the stack reads as separate faces. */
export const AvatarGroup = component<AvatarGroupProps>(
	(props) => html`<div
		data-slot="avatar-group"
		class="${() =>
			cn(
				"group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
				read(props.class),
			)}"
	>${slot(props.children)}</div>`,
);

/** The "+3" that closes a group. */
export const AvatarGroupCount = component<AvatarGroupProps>(
	(props) => html`<span
		data-slot="avatar-group-count"
		class="${() =>
			cn(
				"bg-muted text-muted-foreground ring-background relative flex size-8 shrink-0 items-center justify-center rounded-full text-sm ring-2 group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
				read(props.class),
			)}"
	>${slot(props.children)}</span>`,
);
