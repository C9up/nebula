/**
 * Questionnaire — a survey, one question per step.
 *
 * Composed rather than reimplemented: `RadioGroup`, `Checkbox`, `Input`,
 * `Textarea`, `Progress` and `Button` already exist, so this file is the state
 * machine over them — which question is showing, what has been answered, and
 * whether the reader may move on.
 *
 * Three decisions worth stating, because each has an obvious wrong answer:
 *
 * **The step counter is announced.** A visual progress bar tells a sighted
 * reader they are on question 3 of 8. `aria-live="polite"` on the counter is
 * what tells everyone else, and without it the survey is a series of
 * unexplained page changes.
 *
 * **Answers survive going back.** Moving to the previous question and forward
 * again keeps what was typed. The alternative — clearing on navigation —
 * punishes the reader for checking what they said a moment ago.
 *
 * **A required question blocks Next, and says why.** Disabling the button
 * silently is the common version, and it leaves the reader clicking a dead
 * control with no explanation. The message appears only after an attempt, so
 * the survey does not open by telling you that you have done nothing wrong yet.
 */

import { component, html, signal } from "@c9up/aurora";
import { Button } from "../atoms/Button.js";
import { Checkbox } from "../atoms/Checkbox.js";
import { Input } from "../atoms/Input.js";
import { Progress } from "../atoms/Progress.js";
import { Textarea } from "../atoms/Textarea.js";
import type { Child } from "../lib/children.js";
import { cn } from "../lib/cn.js";
import { uid } from "../lib/id.js";
import { type Reactive, read } from "../lib/props.js";
import { RadioGroup } from "../molecules/RadioGroup.js";

export interface QuestionOption {
	value: string;
	label: Child;
	description?: Child;
}

interface BaseQuestion {
	/** Stable key. The answer is filed under it. */
	id: string;
	prompt: Child;
	description?: Child;
	/** Blocks Next until answered. */
	required?: boolean;
}

export interface SingleChoiceQuestion extends BaseQuestion {
	type: "single";
	options: readonly QuestionOption[];
}

export interface MultipleChoiceQuestion extends BaseQuestion {
	type: "multiple";
	options: readonly QuestionOption[];
}

export interface FreeformQuestion extends BaseQuestion {
	type: "text";
	placeholder?: string;
	/** Renders a textarea instead of a single-line input. */
	multiline?: boolean;
}

export type Question =
	| SingleChoiceQuestion
	| MultipleChoiceQuestion
	| FreeformQuestion;

/** One answer: a value for single/text, a set for multiple. */
export type Answer = string | readonly string[];
export type Answers = Readonly<Record<string, Answer>>;

export interface QuestionnaireProps {
	questions: readonly Question[];
	onComplete: (answers: Answers) => void;
	onAnswerChange?: (id: string, answer: Answer) => void;
	/** Allow skipping questions that are not required. Default `true`. */
	skippable?: boolean;
	showProgress?: boolean;
	backLabel?: string;
	nextLabel?: string;
	skipLabel?: string;
	submitLabel?: string;
	class?: Reactive<string>;
}

function isSingle(question: Question): question is SingleChoiceQuestion {
	return question.type === "single";
}

function isMultiple(question: Question): question is MultipleChoiceQuestion {
	return question.type === "multiple";
}

/** Narrow an answer to the set form, for a multiple-choice question. */
function asSet(answer: Answer | undefined): readonly string[] {
	if (answer === undefined) return [];
	return typeof answer === "string" ? [answer] : answer;
}

/** Narrow an answer to the single form. */
function asValue(answer: Answer | undefined): string {
	if (answer === undefined) return "";
	return typeof answer === "string" ? answer : (answer[0] ?? "");
}

/** Has this question been answered at all? */
export function isAnswered(
	question: Question,
	answer: Answer | undefined,
): boolean {
	if (answer === undefined) return false;
	if (isMultiple(question)) return asSet(answer).length > 0;
	return asValue(answer).trim() !== "";
}

export const Questionnaire = component<QuestionnaireProps>((props) => {
	const total = props.questions.length;
	const step = signal(0);
	const answers = signal<Answers>({});
	/** Set only after a blocked Next, so the survey does not open scolding. */
	const attempted = signal(false);
	const counterId = uid("questionnaire-counter");

	const current = (): Question | undefined => props.questions[step()];

	function answerOf(question: Question): Answer | undefined {
		return answers()[question.id];
	}

	function record(question: Question, answer: Answer): void {
		answers({ ...answers(), [question.id]: answer });
		attempted(false);
		props.onAnswerChange?.(question.id, answer);
	}

	function toggleChoice(question: Question, value: string): void {
		const chosen = asSet(answerOf(question));
		record(
			question,
			chosen.includes(value)
				? chosen.filter((entry) => entry !== value)
				: [...chosen, value],
		);
	}

	function canAdvance(): boolean {
		const question = current();
		if (question === undefined) return false;
		if (question.required !== true) return true;
		return isAnswered(question, answerOf(question));
	}

	function advance(): void {
		if (!canAdvance()) {
			attempted(true);
			return;
		}
		attempted(false);
		if (step() < total - 1) step(step() + 1);
		else props.onComplete(answers());
	}

	function goBack(): void {
		attempted(false);
		if (step() > 0) step(step() - 1);
	}

	function skip(): void {
		attempted(false);
		if (step() < total - 1) step(step() + 1);
		else props.onComplete(answers());
	}

	const isLast = (): boolean => step() === total - 1;

	return html`<section
		data-slot="questionnaire"
		aria-describedby="${counterId}"
		class="${() => cn("flex w-full max-w-xl flex-col gap-6", read(props.class))}"
	>
		${
			props.showProgress === false
				? null
				: html`<div class="flex flex-col gap-2">
					${Progress({
						value: () => step() + 1,
						max: total,
						label: "Questionnaire progress",
					})}
					<p
						id="${counterId}"
						aria-live="polite"
						class="text-muted-foreground text-xs tabular-nums"
					>${() => `Question ${step() + 1} of ${total}`}</p>
				</div>`
		}

		${() => renderQuestion()}

		<div class="flex items-center justify-between gap-2">
			${Button({
				variant: "ghost",
				disabled: () => step() === 0,
				onClick: goBack,
				children: props.backLabel ?? "Back",
			})}
			<div class="flex items-center gap-2">
				${() =>
					props.skippable === false || current()?.required === true
						? null
						: Button({
								variant: "ghost",
								onClick: skip,
								children: props.skipLabel ?? "Skip",
							})}
				${Button({
					onClick: advance,
					children: () =>
						isLast()
							? (props.submitLabel ?? "Submit")
							: (props.nextLabel ?? "Next"),
				})}
			</div>
		</div>
	</section>`;

	function renderQuestion(): Child {
		const question = current();
		if (question === undefined) return null;

		const blocked = attempted() && !canAdvance();
		const errorId = `${question.id}-required`;

		return html`<div data-slot="questionnaire-question" class="flex flex-col gap-3">
			<div class="flex flex-col gap-1">
				<h2 class="text-lg font-medium">
					${question.prompt}${
						question.required === true
							? html`<span aria-hidden="true" class="text-destructive"> *</span>`
							: null
					}
				</h2>
				${
					question.description === undefined
						? null
						: html`<p class="text-muted-foreground text-sm">${question.description}</p>`
				}
			</div>
			${renderControl(question, errorId, blocked)}
			<p
				id="${errorId}"
				role="alert"
				class="text-destructive text-sm empty:hidden"
			>${blocked ? "This question needs an answer before you can continue." : ""}</p>
		</div>`;
	}

	function renderControl(
		question: Question,
		errorId: string,
		blocked: boolean,
	): Child {
		if (isSingle(question)) {
			return RadioGroup({
				name: question.id,
				options: question.options.map((option) => ({
					value: option.value,
					label: option.label,
					description: option.description,
				})),
				value: () => asValue(answerOf(question)),
				onValueChange: (value) => record(question, value),
			});
		}

		if (isMultiple(question)) {
			return html`<div role="group" class="grid gap-3">
				${question.options.map((option) => {
					const id = uid("questionnaire-choice");
					return html`<div class="flex items-start gap-3">
						${Checkbox({
							id,
							name: question.id,
							value: option.value,
							checked: () => asSet(answerOf(question)).includes(option.value),
							onCheckedChange: () => toggleChoice(question, option.value),
						})}
						<div class="grid gap-1 leading-none">
							<label for="${id}" class="text-sm leading-none font-medium select-none"
								>${option.label}</label
							>
							${
								option.description === undefined
									? null
									: html`<p class="text-muted-foreground text-sm">${option.description}</p>`
							}
						</div>
					</div>`;
				})}
			</div>`;
		}

		const shared = {
			name: question.id,
			placeholder: question.placeholder,
			invalid: blocked,
			describedBy: errorId,
			value: () => asValue(answerOf(question)),
			onInput: (value: string) => record(question, value),
		};
		return question.multiline === true
			? Textarea({ ...shared, rows: 4 })
			: Input(shared);
	}
});
