# @c9up/nebula

> shadcn/ui, ported to Aurora, organised as atomic design. Zero runtime dependencies, copy-the-source registry, swappable CSS engine.

Part of **[Ream](https://github.com/C9up/ream)** — a Rust-powered, AdonisJS-compatible Node.js framework. Independent, publishable package.

## What this is

shadcn/ui is React. [Aurora](https://github.com/C9up/aurora) is a tagged-template DOM runtime with signals and no build step. nebula is the shadcn component set — the same markup, the same Tailwind classes, the same behaviour — written for Aurora.

Sixty-nine components across four atomic layers, plus the headless behaviour layer Radix would otherwise provide. Every component in shadcn's registry has a counterpart; several are deliberately narrower, and the [parity section](#parity-with-shadcn) says exactly which.

## Installation

```bash
pnpm add @c9up/nebula
npx nebula init --adapter tailwind
```

`init` writes `config/nebula.ts` and the stylesheet for your chosen engine, then prints the packages to install and the build command to register. It installs nothing and edits no `package.json` of yours.

## Two ways to use it

```ts
// Import it — quickest to try
import { Button, Card, CardHeader } from '@c9up/nebula'

// Or take the source — what the library is really for
// $ npx nebula add button card
import { Button } from '#pages/atoms/Button.js'
```

`nebula add` copies the component's source into your project and hands it over. No version, no upgrade path, no wrapper to fight when a design needs one class changed. That is shadcn's premise and nebula keeps it.

```bash
npx nebula list                    # everything in the registry
npx nebula list --layer organisms
npx nebula add dialog data-table   # copies both, plus what they depend on
npx nebula add button --force      # overwrite your edited copy
```

Copies mirror the package's own layout, so `atoms/Button` finds `../lib/cva.js` for the same reason it does inside nebula. **No import is ever rewritten** — that is where a copy-the-source CLI usually accumulates its edge cases.

**JavaScript by default.** An Aurora app serves `resources/pages` to the browser unbuilt — that zero-build-step promise is the framework's premise — so TypeScript dropped into that tree does not run. `nebula add` copies the compiled output instead: valid ESM, `.js` specifiers already correct, and every doc comment intact, so what you own is still readable source. The language is inferred from what your components directory already holds; `--ts` and `--js` override it.

## Zero runtime dependencies

shadcn stands on Radix, `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `@floating-ui/dom`, `cmdk`, `sonner`, `recharts`, `@tanstack/react-table` and `react-day-picker`. None are React-agnostic, and this workspace had already decided `cn` was worth writing by hand rather than installing two packages. So:

| shadcn dependency | nebula |
| --- | --- |
| `clsx` + `tailwind-merge` | `cn` from `@c9up/aurora` — already written from scratch there |
| `class-variance-authority` | `lib/cva.ts` — reimplemented, and it runs its result through `cn` |
| Radix UI | `primitives/` — focus trap, dismissable layers, roving focus, type-ahead, presence, portals |
| `@floating-ui/dom` | `primitives/floating.ts` — offset, flip, shift, arrow, available height |
| `lucide-react` | `lib/icons.ts` — the eighteen glyphs the set needs, inlined |
| `cmdk` | `organisms/Command.ts` |
| `sonner` | `organisms/Toaster.ts` |
| `react-day-picker` + `date-fns` | `organisms/Calendar.ts` — `Date` and `Intl` |
| `@tanstack/react-table` | `organisms/DataTable.ts` — sort, filter, page, select |
| `recharts` | `organisms/Chart.ts` — line, area and bar, as inline SVG |
| `react-hook-form` | `form()` from `@c9up/aurora`, bound by `organisms/Form.ts` |
| `tw-animate-css` | four keyframes in `theme.css` |

Several of those are narrower than what they replace — see [parity with shadcn](#parity-with-shadcn) for the full list rather than a reassuring summary.

## Parity with shadcn

Checked against shadcn's published component list, not from memory. Every one of its components has a counterpart here — including the conversational set (`Bubble`, `Message`, `MessageScroller`, `Attachment`, `Marker`), `NativeSelect` and `Questionnaire` — and the ~40 simple ones are faithful down to the class strings, the variants and the ARIA attributes.

Two of shadcn's entries have no direct counterpart on purpose. `DirectionProvider` is React context; Aurora has none, and the direction belongs on `<html dir>` — what it was really buying is [RTL support](#right-to-left), which is handled in the placement engine instead. `Form` has been folded into `Field` upstream; nebula ships both, with `Form` binding Aurora's own form controller. The components shadcn builds by wrapping a third-party library are reimplementations, and they are narrower. Stated plainly, because "complete port" would not be true:

| Component | shadcn | nebula |
| --- | --- | --- |
| Chart | Recharts, in full | line, area and bar over one categorical axis |
| DataTable | TanStack Table (column grouping, virtualisation, pinning, faceted filters, server-side) | sort, filter, page, select — in memory |
| Sidebar | ~15 parts | the parts that are not re-skinned atoms — see below |
| Carousel | embla (loop, autoplay, N slides per view) | scroll-snap, one slide per view, no loop or autoplay |
| Toaster | sonner (promise toasts, arbitrary JSX, multiple positions) | four variants, action, pause on hover |
| Resizable | arbitrary nesting, persisted layouts, collapse-to-zero | two panes, one handle |
| Combobox | single, multi-select and creatable recipes | single-select |
| ScrollArea | scrollbars redrawn by Radix | native scrollbars, styled |
| Calendar | react-day-picker, every selection mode | single date and range; no multi-month, no multi-select |
| Questionnaire | branching logic, validation schemas | linear steps; single, multiple, freeform, skippable |
| Bubble / Message | rich composition slots | the parts nebula's own layout needs |

Two API-wide differences, both consequences of the runtime rather than choices about scope: there is no `asChild` (a compiled template has no element to clone), and compound components take data rather than children (Aurora has no React context).

**The Sidebar deserves its own note**, because porting it part-for-part would have fought the atomic taxonomy rather than following it. `SidebarInput`, `SidebarSeparator` and `SidebarMenuSkeleton` are the existing `Input`, `Separator` and `Skeleton` atoms with a prefix — redeclaring them would break the composition rule the whole library is organised on. `SidebarProvider` is React context, and nebula's sidebar owns its own shared signal instead. `SidebarInset` is the content column beside the rail, which is `AppShell`, a template. What was genuinely missing and has been added: `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuAction`, a badge slot, and tooltips when the rail is collapsed.

## Right to left

The placement engine mirrors itself. Placements are written physically —
`"right-start"` for a submenu — because that is what reads clearly at the call
site, and `resolvePosition` flips them when the anchor computes to
`direction: rtl`. `autoPosition` reads that off the anchor on every update, so
no component passes a flag and a language switcher flipped mid-session moves
open surfaces with it.

The mirror is not symmetric, which is the part worth knowing: for `left`/`right`
the *side* swaps and the alignment is untouched; for `top`/`bottom` the side
stays and the *alignment* swaps. Mirroring both halves of `bottom-start` would
land it back where it started.

Components use logical properties (`ms-*`, `me-*`, `start-*`, `end-*`) wherever
a side is meant relative to the text, so a `Bubble` aligned to the end sits
right in English and left in Arabic. Where a side is a genuine layout choice —
which edge a `Sheet` enters from, which side a `Sidebar` occupies — it stays
physical, because that is what the caller means.

## Choose your CSS engine

nebula declares **no CSS dependency at all**, not even a peer one. You install the engine you want; `config/nebula.ts` names it; nebula generates the matching stubs and build command. Same arrangement AdonisJS uses for its asset bundler.

```ts
// config/nebula.ts
import { defineConfig } from '@c9up/nebula'

export default defineConfig({
  adapter: 'tailwind',              // 'tailwind' | 'unocss' | 'css'
  paths: {
    components: 'resources/pages',
    css: 'resources/css/app.css',
    output: 'public/app.css',
  },
})
```

| Adapter | What it does | You install |
| --- | --- | --- |
| `tailwind` | Tailwind v4, configured in CSS. What shadcn itself targets. | `tailwindcss @tailwindcss/cli` |
| `unocss` | `presetWind4` — same class syntax, no PostCSS, faster. | `unocss @unocss/cli` |
| `css` | Nothing. nebula ships a prebuilt stylesheet. | — |

All three consume the same class names, which is what lets one set of components serve all of them. Switching is a one-word change plus `nebula init`.

**The `css` adapter's limit, stated plainly.** `nebula.css` is compiled at nebula's release time and covers the components as published. Edit a copied component to add a utility nebula never used and nothing emits it — the class silently does nothing. Use it when you take the components as they are; use `tailwind` or `unocss` when you intend to retune them.

An engine with a different authoring model — Panda's recipes, StyleX — cannot go behind this interface. It would need a second version of every component.

## Atomic design

shadcn is a flat `ui/` directory. nebula sorts the same components into layers, and the layer is a property of the component: `nebula add button` knows Button is an atom.

```
resources/pages/
├── lib/          cn, cva, icons, ids, reactive props
├── primitives/   the headless layer — focus, dismissal, placement, presence
├── atoms/        one element, composing nothing from nebula
├── molecules/    assembles atoms, or owns state across several elements
├── organisms/    portals, traps focus, floats, or coordinates molecules
└── templates/    page skeletons
```

The rule is composition, not complexity. Slider is an atom though it is interactive, because it is one input. Card is a molecule though it is trivial, because it assembles parts.

<details>
<summary><strong>All 69 components</strong></summary>

**atoms (19)** — AspectRatio, Avatar, Badge, Button, Checkbox, Input, Kbd, Label, Marker, NativeSelect, Progress, ScrollArea, Separator, Skeleton, Slider, Spinner, Switch, Textarea, Toggle

**molecules (21)** — Accordion, Alert, Attachment, Breadcrumb, Bubble, ButtonGroup, Card, Collapsible, Empty, Field, InputGroup, InputOTP, Item, Message, Pagination, RadioGroup, Resizable, Table, Tabs, ToggleGroup, Typography

**organisms (26)** — AlertDialog, Calendar, Carousel, Chart, Combobox, Command, CommandDialog, ContextMenu, DataTable, DatePicker, DateRangePicker, Dialog, Drawer, DropdownMenu, Form, HoverCard, Menubar, MessageScroller, NavigationMenu, Popover, Questionnaire, Select, Sheet, Sidebar, Toaster, Tooltip

**templates (3)** — AppShell, AuthLayout, SettingsLayout

</details>

## The API difference

shadcn composes through React context:

```tsx
<Tabs defaultValue="account">
  <TabsList><TabsTrigger value="account">Account</TabsTrigger></TabsList>
  <TabsContent value="account">…</TabsContent>
</Tabs>
```

Aurora has no context, and the workarounds — a factory returning bound parts, a handle threaded through props — are more machinery for less clarity. So compound components take data:

```ts
Tabs({
  defaultValue: 'account',
  items: [
    { value: 'account', label: 'Account', content: html`…` },
    { value: 'password', label: 'Password', content: html`…` },
  ],
})
```

The rendered markup is unchanged, so shadcn's CSS and its examples still read across. Free-form containers take named slots instead:

```ts
Dialog({
  trigger: 'Edit profile',
  title: 'Edit profile',
  description: "Make changes here. Click save when you're done.",
  children: [TextField({ bind: bind(profile, 'name'), label: 'Name' })],
  footer: SubmitButton({ form: profile, label: 'Save' }),
})
```

There is no `asChild`. React's Slot clones an element and merges props into it; Aurora templates are compiled markup with nothing to clone. Where shadcn writes `<Button asChild><a/></Button>`, nebula exports the variants:

```ts
html`<a href="/docs" class="${buttonVariants({ variant: 'outline' })}">Docs</a>`
```

## Reactive props

Aurora never re-renders. Any prop that can change is `Reactive<T>` — pass a constant when it never moves, an accessor when it does:

```ts
Button({ disabled: true })                  // static
Button({ disabled: () => form.submitting() }) // live
```

A value read once at setup is frozen for the lifetime of the node, so `disabled: form.submitting()` is a bug that only shows after the first submit.

## Accessibility

The headless layer is most of this package, and it is where shadcn's behaviour actually lives. What is implemented, rather than approximated:

- **Focus trap** — Tab wraps, focus returns to the trigger, and a `focusin` handler catches focus arriving by any other route.
- **Modal** — the page behind is `aria-hidden`, not merely unreachable by Tab. Trapping keyboard focus does nothing for a reader navigating by landmark.
- **Dismissable layers** — one stack. Escape reaches the topmost layer that accepts it; a pointer outside closes layers above the one it landed in and no further.
- **Roving focus** — a menu, tab list or toolbar is one tab stop.
- **Type-ahead** — accumulating buffer, and a repeated letter cycles.
- **Charts** — the same data is emitted as a visually hidden `<table>`. No ARIA makes an SVG readable.
- **Live regions** — `polite` for toasts, `assertive` for errors, mounted empty before anything arrives.

## Development

```bash
pnpm test        # 391 unit tests
pnpm typecheck
pnpm lint
pnpm registry    # regenerate registry.json from the source tree
pnpm css         # freeze nebula.css for the `css` adapter
pnpm build
```

`registry.json` is derived from the imports rather than maintained by hand, and a test asserts that every file an item ships actually resolves — the failure it guards is otherwise silent, showing up in a user's build rather than here.

Coverage sits around 83% of statements. The shape matters more than the number: every component is mounted and unmounted by `render-smoke.test.ts`, the shared surfaces and the headless primitives are tested directly, and the overlays are opened rather than only rendered closed. What the suite cannot reach is pointer-drag — happy-dom has no `setPointerCapture`, so Drawer's swipe-to-dismiss and Resizable's drag are covered by their keyboard paths only.

## Licence

MIT
