import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cva } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

// Floating positioning takes device pixels, so this cannot be a rem token.
const MENU_SIDE_OFFSET_PX = 4

function Menu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />
}

// The package's one focus ring, so the trigger does not fall back to the base layer's outline.
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

// Props go to the positioner; `className` to the popup, narrowed to `string` because `cn` silently
// drops the callback form.
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
        // Above the roster's sticky bands (z-5).
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

// Generic so callers get their value union back instead of base-ui's `any`.
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

// Active is amber text with no hover step: amber means "chosen" and the pointer must not mask it.
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
  // Base UI keeps a radio item open on click; the design closes on pick.
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
      {/* Always drawn so row height is stable; `aria-hidden` since `aria-checked` carries the
          state and the tick would pollute the accessible name. */}
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
