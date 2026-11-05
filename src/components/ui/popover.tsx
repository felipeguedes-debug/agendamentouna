"use client";

import type { ComponentProps } from "react";
import { Popover as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;

export function PopoverContent({ className, sideOffset = 6, align = "end", ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 w-72 rounded-xl border border-border bg-white p-3 text-sm shadow-lg outline-none", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}
