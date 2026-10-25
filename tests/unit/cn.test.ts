import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn with the fluid tokens", () => {
  it("keeps the colour when a fluid font size is added next to it", () => {
    expect(cn("text-primary-foreground text-xs", "text-fluid-sm")).toBe("text-primary-foreground text-fluid-sm");
  });

  it("lets a fluid size replace another font size, and a later one replace an earlier one", () => {
    expect(cn("text-sm", "text-fluid-base")).toBe("text-fluid-base");
    expect(cn("text-fluid-sm", "text-fluid-lg")).toBe("text-fluid-lg");
  });

  it("treats fluid spacing like normal spacing", () => {
    expect(cn("p-4", "p-fluid-md")).toBe("p-fluid-md");
    expect(cn("gap-fluid-sm", "gap-fluid-lg")).toBe("gap-fluid-lg");
  });

  it("still resolves ordinary conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
