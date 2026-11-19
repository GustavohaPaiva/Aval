import { describe, expect, it } from "vitest";
import {
  canAccessLogistica,
  canOperateFinanceiro,
  canViewFinanceiroPedido,
} from "./roleAccess";

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

describe("acesso financeiro", () => {
  it("libera operação ao gestor e ao financeiro", () => {
    expect(canOperateFinanceiro("gestor")).toBe(true);
    expect(canOperateFinanceiro("financeiro")).toBe(true);
  });

  it("impede consultor e logística de registrar recebimento", () => {
    expect(canOperateFinanceiro("consultor")).toBe(false);
    expect(canOperateFinanceiro("logistica")).toBe(false);
    expect(canOperateFinanceiro(null)).toBe(false);
  });

  it("deixa o consultor apenas consultar a situação do pedido", () => {
    expect(canViewFinanceiroPedido("consultor")).toBe(true);
    expect(canViewFinanceiroPedido("gestor")).toBe(true);
    expect(canViewFinanceiroPedido("financeiro")).toBe(true);
    expect(canViewFinanceiroPedido("logistica")).toBe(false);
  });
});
