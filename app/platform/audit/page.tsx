import { createAdminClient } from "@/lib/supabase/admin";
import { AuditLogTable } from "@/components/platform/AuditLogTable";
import type { AuditEntry } from "@/lib/platform/types";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformAuditPage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("platform_audit_log")
    .select("id, action, target_type, target_id, metadata, created_at, operator_id")
    .order("created_at", { ascending: false })
    .limit(100);

  const operatorIds = [
    ...new Set((rows ?? []).map((r) => r.operator_id).filter(Boolean)),
  ] as string[];
  const { data: operators } = operatorIds.length
    ? await admin.from("platform_operators").select("user_id, full_name").in("user_id", operatorIds)
    : { data: [] };
  const opNames = new Map((operators ?? []).map((o) => [o.user_id, o.full_name]));

  const entries: AuditEntry[] = (rows ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    operatorName: r.operator_id ? opNames.get(r.operator_id) ?? null : null,
    createdAt: r.created_at,
  }));

  return <AuditLogTable entries={entries} />;
}
