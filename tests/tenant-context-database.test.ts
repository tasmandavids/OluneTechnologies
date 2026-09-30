import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";

// PostgreSQL runs in-process. This exercises actual functions, triggers, roles,
// FK constraints and RLS; it is not a mock or a live Supabase integration test.
const db = new PGlite();
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const user = "00000000-0000-0000-0000-000000000010";
const ownerB = "00000000-0000-0000-0000-000000000011";
const fresh = "00000000-0000-0000-0000-000000000012";

async function identity(id = user) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec("set role authenticated");
}
async function context() {
  return (await db.query("select private.current_studio() as studio, private.current_user_role()::text as role")).rows[0];
}

beforeAll(async () => {
  await db.exec(readFileSync(new URL("./fixtures/tenant-context.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20260930024829_onboarding_tenant_context.sql", import.meta.url), "utf8"));
  await db.exec(`
    create trigger profiles_guard_privileges before update on public.profiles
      for each row execute function private.guard_profile_privileges();
    create policy classes_member_read on public.classes for select to authenticated
      using (studio_id = private.current_studio());
    create policy classes_admin_all on public.classes for all to authenticated
      using (studio_id = private.current_studio() and private.current_user_role() = 'admin')
      with check (studio_id = private.current_studio() and private.current_user_role() = 'admin');
  `);
}, 30_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin;
    insert into studios(id,name,slug,status) values ('${a}','Studio A','studio-a','trial'),('${b}','Studio B','studio-b','trial');
    insert into profiles(id,studio_id,active_studio_id,role) values
      ('${user}','${a}','${a}','admin'),('${ownerB}','${b}','${b}','admin');
    insert into profiles(id) values ('${fresh}');
    insert into studio_memberships(user_id,studio_id,role,status,is_primary) values
      ('${user}','${a}','admin','active',true),('${user}','${b}','parent','active',false),
      ('${ownerB}','${b}','admin','active',true);
    insert into classes(studio_id,name) values ('${a}','A class'),('${b}','B class');
  `);
});
afterEach(async () => { await db.exec("rollback; reset role;"); });

describe("database workspace boundary", () => {
  it.each([[user, a, "A class"], [ownerB, b, "B class"]])(
    "owner %s can read and write only studio %s",
    async (id, studio, name) => {
      await identity(id);
      expect((await db.query("select name from classes")).rows).toEqual([{ name }]);
      expect((await db.query("update classes set name=name where studio_id <> $1 returning id", [studio])).rows).toHaveLength(0);
      expect((await db.query("update classes set name=name where studio_id = $1 returning id", [studio])).rows).toHaveLength(1);
      await expect(db.query("insert into classes(studio_id,name) values ($1,'intrusion')", [studio === a ? b : a])).rejects.toThrow(/row-level security/);
    },
  );
  it("uses the parent role at B even with an old admin token from A", async () => {
    await db.exec(`update profiles set active_studio_id='${b}' where id='${user}';`);
    await identity();
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({studio_id:a,user_role:"admin"})]);
    expect(await context()).toEqual({ studio:b, role:"parent" });
    expect((await db.query("select name from classes")).rows).toEqual([{name:"B class"}]);
    expect((await db.query("update classes set name='intrusion' returning id")).rows).toHaveLength(0);
  });
  it("suspended membership denies access immediately", async () => {
    await db.exec(`update profiles set active_studio_id='${b}' where id='${user}';
      update studio_memberships set status='suspended' where user_id='${user}' and studio_id='${b}';`);
    await identity();
    expect(await context()).toEqual({studio:null,role:null});
    expect((await db.query("select * from classes")).rows).toHaveLength(0);
  });
  it("blocks direct profile selection of an unrelated studio", async () => {
    await db.exec(`delete from studio_memberships where user_id='${user}' and studio_id='${b}';`);
    await identity();
    await expect(db.query("update profiles set active_studio_id=$1 where id=$2",[b,user])).rejects.toThrow(/membership required/);
  });
  it("an admin cannot directly move their home profile into another studio", async () => {
    await identity();
    await expect(db.query("update profiles set studio_id=$1 where id=$2",[b,user])).rejects.toThrow(/Not authorized/);
  });
  it("refresh hook pairs the active studio with its actual role", async () => {
    await db.exec(`update profiles set active_studio_id='${b}' where id='${user}';`);
    const event = {user_id:user,claims:{studio_id:a,user_role:"admin",sub:user}};
    const result = await db.query<{claims:{studio_id:string;user_role:string}}>("select public.custom_access_token_hook($1::jsonb)->'claims' as claims",[JSON.stringify(event)]);
    expect(result.rows[0].claims).toMatchObject({studio_id:b,user_role:"parent"});
  });
  it("first parent registration creates a profile scope and primary membership", async () => {
    await identity(fresh);
    await db.query("select register_studio_member('studio-b','parent',false,null)");
    expect(await context()).toEqual({studio:b,role:"parent"});
    expect((await db.query("select is_primary,role from studio_memberships where user_id=$1",[fresh])).rows).toEqual([{is_primary:true,role:"parent"}]);
  });
  it("direct RPC cannot bypass adult age validation", async () => {
    await identity(fresh);
    await expect(db.query("select register_studio_member('studio-b','student',true,current_date)")).rejects.toThrow(/18 or older/);
  });
  it("self-registration cannot reactivate a suspended membership", async () => {
    await db.exec(`update studio_memberships set status='suspended' where user_id='${user}' and studio_id='${b}';`);
    await identity();
    await expect(db.query("select register_studio_member('studio-b','parent',false,null)")).rejects.toThrow(/contact the studio/);
  });
  it("workspace creation atomically creates the admin context", async () => {
    await identity(fresh);
    const result = await db.query<{id:string}>("select create_studio_for_user('Studio C','studio-c','dance') as id");
    expect(await context()).toEqual({studio:result.rows[0].id,role:"admin"});
    expect((await db.query("select studio_id from studio_memberships where user_id=$1",[fresh])).rows).toEqual([{studio_id:result.rows[0].id}]);
  });
  it("adult student registration sets self-managed status", async () => {
    await identity(fresh);
    await db.query("select register_studio_member('studio-b','student',true,(current_date - interval '18 years')::date)");
    expect(await context()).toEqual({studio:b,role:"student"});
    expect((await db.query("select self_managed from profiles where id=$1",[fresh])).rows).toEqual([{self_managed:true}]);
  });
  it("an instructor workspace keeps its teacher role", async () => {
    await identity(fresh);
    const result = await db.query<{id:string}>("select create_instructor_workspace_for_user('Teacher C','teacher-c','dance') as id");
    expect(await context()).toEqual({studio:result.rows[0].id,role:"teacher"});
  });
  it("a revoked membership clears previously issued routing claims", async () => {
    await db.exec(`update profiles set active_studio_id='${b}' where id='${user}';
      update studio_memberships set status='suspended' where user_id='${user}' and studio_id='${b}';`);
    const event = {user_id:user,claims:{studio_id:b,user_role:"parent",sub:user}};
    const result = await db.query<{claims:Record<string,unknown>}>("select public.custom_access_token_hook($1::jsonb)->'claims' as claims",[JSON.stringify(event)]);
    expect(result.rows[0].claims).toEqual({sub:user});
  });
  it("registration requires an existing profile", async () => {
    await db.exec(`delete from profiles where id='${fresh}'`);
    await identity(fresh);
    await expect(db.query("select register_studio_member('studio-b','parent',false,null)")).rejects.toThrow(/profile is not ready/);
  });
  it("a null self-registration role is rejected", async () => {
    await identity(fresh);
    await expect(db.query("select register_studio_member('studio-b',null,false,null)")).rejects.toThrow(/invalid role/);
  });
  it("creation fails for an account whose profile is missing", async () => {
    await db.exec(`delete from profiles where id='${fresh}'`);
    await identity(fresh);
    await expect(db.query("select create_studio_for_user('Studio C','studio-c','dance')")).rejects.toThrow(/profile is not ready/);
  });
});
