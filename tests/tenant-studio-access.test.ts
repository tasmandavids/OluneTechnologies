import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ host: "localhost:3000", tenant: null as {id:string} | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({host:state.host}) }));
vi.mock("@/lib/tenant", () => ({ resolveStudio: async () => state.tenant }));
vi.mock("@/lib/portal/access", () => ({
  isStudioOpsRole: (role:string) => ["admin","office"].includes(role),
  resolveEffectiveStudioId: (p:{studio_id:string;active_studio_id?:string}) => p.active_studio_id ?? p.studio_id,
}));
import { resolveTenantStudioId, userHasOpsAccessToStudio } from "@/lib/portal/tenant-studio";
import { userRoleForStudio } from "@/lib/account/studio-role";
const profile = {studio_id:"a", active_studio_id:"b", role:"admin" as const};
function client(role:string | null, status="active", error:unknown=null) {
  const query = {select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({data:role ? {id:"m",role,status} : null,error});
  return {from:vi.fn(() => query)} as unknown as SupabaseClient;
}
beforeEach(() => { state.host="localhost:3000";state.tenant=null; });
describe("application workspace authorization", () => {
  it("admin at A has parent permissions at B", async () => {
    const db=client("parent");
    expect(await userRoleForStudio(db,"u",profile,"b")).toBe("parent");
    expect(await userHasOpsAccessToStudio(db,"u",profile,"b")).toBe(false);
    expect((await resolveTenantStudioId(db,"u",profile,{requireOpsAccess:true})).studioId).toBeNull();
  });
  it("home parents can hold an admin role at a second studio", async () => {
    expect(await userHasOpsAccessToStudio(client("admin"),"u",{...profile,role:"parent"},"b")).toBe(true);
  });
  it.each(["pending","suspended"])("%s membership never grants permissions", async status => {
    expect(await userRoleForStudio(client("admin",status),"u",profile,"b")).toBeNull();
    expect((await resolveTenantStudioId(client("admin",status),"u",profile)).studioId).toBeNull();
  });
  it("an arbitrary active studio ID cannot substitute for membership", async () => {
    expect((await resolveTenantStudioId(client(null),"u",profile)).studioId).toBeNull();
  });
  it("membership lookup errors fail closed", async () => {
    expect(await userRoleForStudio(client(null,"active",{message:"offline"}),"u",profile,"a")).toBeNull();
  });
  it("legacy home profiles keep home access only", async () => {
    expect(await userRoleForStudio(client(null),"u",profile,"a")).toBe("admin");
    expect(await userRoleForStudio(client(null),"u",profile,"b")).toBeNull();
  });
  it("host cannot override the database workspace", async () => {
    state.host="studio-a.localhost:3000"; state.tenant={id:"a"};
    expect((await resolveTenantStudioId(client("admin"),"u",profile)).studioId).toBeNull();
  });
  it("unknown tenant hosts cannot fall back to another studio", async () => {
    state.host="unknown.localhost:3000";
    expect((await resolveTenantStudioId(client("admin"),"u",profile)).studioId).toBeNull();
  });
  it("matching tenant and active membership resolve normally", async () => {
    state.host="studio-b.localhost:3000"; state.tenant={id:"b"};
    expect(await resolveTenantStudioId(client("parent"),"u",profile)).toEqual({studioId:"b",error:null});
  });
});
