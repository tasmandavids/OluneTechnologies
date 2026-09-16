import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/i18n/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/portal/session", () => ({ requirePortalSession: mocks.session }));
import { recordInstallmentPayment } from "@/app/portal/admin/payment-plans/actions";
const id = "30000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ supabase: { rpc: mocks.rpc }, role: "admin" });
  mocks.rpc.mockResolvedValue({ error: null });
});
describe("installment action boundary", () => {
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648])("rejects invalid amount %s before any RPC", async amount => {
    expect(await recordInstallmentPayment(id, amount)).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers", async () => {
    expect(await recordInstallmentPayment("invalid", 100)).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects non-operations roles", async () => {
    mocks.session.mockResolvedValue({ supabase: { rpc: mocks.rpc }, role: "parent" });
    expect(await recordInstallmentPayment(id, 100)).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["admin", "office"])("retains %s access and delegates tenant validation to SQL", async role => {
    mocks.session.mockResolvedValue({ supabase: { rpc: mocks.rpc }, role });
    expect(await recordInstallmentPayment(id, 100)).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("admin_record_installment_payment", { p_plan_id: id, p_amount_cents: 100 });
  });
  it("does not report success when SQL rejects a payment", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Payment plan unavailable" } });
    expect(await recordInstallmentPayment(id, 100)).toEqual({ error: "Payment plan unavailable" });
  });
});
