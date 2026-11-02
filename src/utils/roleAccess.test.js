import { describe, expect, it } from "vitest";
import { canAccessLogistica } from "./roleAccess";

describe("acesso à operação logística", () => {
  it("libera gestor e logística", () => {
    expect(canAccessLogistica("gestor")).toBe(true);
    expect(canAccessLogistica("logistica")).toBe(true);
  });

  it("bloqueia consultor e cargos desconhecidos", () => {
    expect(canAccessLogistica("consultor")).toBe(false);
    expect(canAccessLogistica(null)).toBe(false);
    expect(canAccessLogistica(undefined)).toBe(false);
    expect(canAccessLogistica("")).toBe(false);
  });
});
