import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cva } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

// The one dropdown in the product: a flat list on the tooltip surface, no
// border, no shadow, no accent edge — the same field the where-used popup and
// the options panel's info tip sit on. Radius 0, like everything else.
//
// It is a primitive rather than hand-rolled markup in the app for the reason
// every other base-ui wrapper here is one: the design's own prototype has no
// keyboard path at all, no `role="menu"`, no `aria-expanded` and no
// `aria-haspopup`. All of those, plus Escape and outside-click, come free from
// the primitive, and the app never has to know how any of them work.
//
// The trigger is the caller's: its accessible name and its glyph are app copy.

// Floating positioning is a device-pixel API — it feeds `transform:
// translate()`, not a stylesheet — so this is the one measurement in the
// package that cannot be a rem token. Four pixels of air under the trigger.
const MENU_SIDE_OFFSET_PX = 4

function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />
}

// The one thing on the trigger that is NOT the caller's: every focusable
// control this package ships draws one ring, and a bare pass-through would
// fall through to the base layer's `* { outline-ring/50 }`, which names a
// colour and leaves whether anything is drawn to the user agent. Written here
// once rather than at the call site — a caller restating it is the drift the
// rule exists to stop.
function MenuTrigger({
  className,
  ...props
}: Omit<MenuPrimitive.Trigger.Props, "className"> & { className?: string }) {
  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      className={cn(
        "outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      {...props}
    />
  )
}

// Portal · Positioner · Popup in one part, the way `DialogContent` composes its
// own three: the caller cannot put a positioning prop on the popup, where it
// would land on the DOM node as an unknown attribute.
//
// Every prop but `className` is the POSITIONER's, and `className` is the
// POPUP's — the two are different elements with different state types, so the
// positioner's own type cannot describe it. It is narrowed to `string` rather
// than carrying the popup's `string | ((state) => string | undefined)`,
// because `cn` is `twMerge(clsx(...))` and clsx drops a function with no
// error: typed as the primitive types it, the callback form would compile and
// then silently produce no class at all.
function MenuPopup({
  className,
  children,
  side = "bottom",
  align = "end",
  sideOffset = MENU_SIDE_OFFSET_PX,
  ...props
}: Omit<MenuPrimitive.Positioner.Props, "className"> & {
  className?: string
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        data-slot="menu-positioner"
        side={side}
        align={align}
        sideOffset={sideOffset}
        // Above the roster's sticky bands, which sit at 5 — a menu opened from
        // the panel header must not be covered by a band scrolling under it.
        className="z-[130]"
        {...props}
      >
        <MenuPrimitive.Popup
          data-slot="menu-popup"
          className={cn(
            "min-w-[5.375rem] bg-tip-field px-[0.625rem] py-[0.4375rem] outline-none",
            className
          )}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

// Generic over the value, which Base UI types as `any` on both the prop and
// the handler. A radio group's members are one union by construction, so the
// caller gets that union back rather than having to narrow an `any` at every
// call site — which would be a cast wearing an annotation.
function MenuRadioGroup<Value extends string>({
  value,
  onValueChange,
  ...props
}: Omit<
  MenuPrimitive.RadioGroup.Props,
  "value" | "defaultValue" | "onValueChange"
> & {
  value: Value
  onValueChange: (value: Value) => void
}) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="menu-radio-group"
      value={value}
      onValueChange={(next: Value) => onValueChange(next)}
      {...props}
    />
  )
}

// The active row is amber TEXT only — no fill, no left edge, no bold — and it
// has NO hover step, for the reason `Chip` reserves amber at all: it means
// "the user chose this", so nothing the pointer does may mask it. The design's
// own cascade declares `.grpi:hover` after `.grpi.on` at equal specificity, so
// hovering the active row there makes it look inactive; that is an accident
// and it is not reproduced.
const menuRadioItemVariants = cva(
  "flex cursor-pointer gap-[0.625rem] font-mono text-8_5 leading-[1.75] font-normal whitespace-nowrap normal-case outline-none focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      active: {
        true: "text-brand-ink",
        false: "text-matrix-ink hover:text-ink-primary",
      },
    },
    defaultVariants: { active: false },
  }
)

function MenuRadioItem({
  className,
  children,
  // Base UI leaves a radio item open on click; the design closes on pick, and
  // a two-item mode switch has nothing further to offer once one is taken.
  closeOnClick = true,
  ...props
}: Omit<MenuPrimitive.RadioItem.Props, "className"> & { className?: string }) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      closeOnClick={closeOnClick}
      className={(state) =>
        cn(menuRadioItemVariants({ active: state.checked }), className)
      }
      {...props}
    >
      {children}
      {/* The slot is always drawn and the tick only sometimes, so the row
          height never changes with the selection. `aria-hidden` because the
          state is already on the accessibility tree as `aria-checked` — left
          exposed, the active row's accessible name becomes `domain ✓` and no
          exact-name query can reach it. */}
      <span aria-hidden className="ml-auto">
        <MenuPrimitive.RadioItemIndicator>✓</MenuPrimitive.RadioItemIndicator>
      </span>
    </MenuPrimitive.RadioItem>
  )
}

export {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  menuRadioItemVariants,
}
