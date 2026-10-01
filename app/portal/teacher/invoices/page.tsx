import { createClient } from "@/lib/supabase/server";
import { ContractorInvoicesManager } from "@/components/portal/teacher/ContractorInvoicesManager";

export type ContractorInvoice = {
  id: string;
  invoiceNumber: number | null;
  recipientLabel: string;
  studioId: string | null;
  privateClientId: string | null;
  description: string;
  lineItems: { description: string; quantity: number; unit_cents: number }[];
  amountCents: number;
  status: "draft" | "sent" | "paid" | "void";
  dueDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  /** The contractor's own invoice document, when they attached one. */
  attachment: { path: string; name: string; mime: string; size: number } | null;
};

export type ClientOption = {
  id: string;
  label: string;
  kind: "studio" | "private";
};

export default async function ContractorInvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [invoicesRes, clientsRes, membershipsRes] = await Promise.all([
    supabase
      .from("contractor_invoices")
      .select("*")
      .eq("instructor_id", user!.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("private_clients")
      .select("id, full_name")
      .eq("instructor_id", user!.id)
      .order("full_name"),

    supabase
      .from("studio_memberships")
      .select("studio_id, studios!inner ( id, name )")
      .eq("user_id", user!.id)
      .eq("status", "active"),
  ]);

  const invoices: ContractorInvoice[] = (invoicesRes.data ?? []).map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number ?? null,
    recipientLabel: r.recipient_label,
    studioId: r.studio_id ?? null,
    privateClientId: r.private_client_id ?? null,
    description: r.description,
    lineItems: (r.line_items as ContractorInvoice["lineItems"]) ?? [],
    amountCents: r.amount_cents,
    status: r.status as ContractorInvoice["status"],
    dueDate: r.due_date ?? null,
    paidAt: r.paid_at ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    attachment: r.attachment_path
      ? { path: r.attachment_path, name: r.attachment_name ?? "invoice", mime: r.attachment_mime ?? "application/pdf", size: Number(r.attachment_size ?? 1) }
      : null,
  }));

  const clientOptions: ClientOption[] = [
    ...(membershipsRes.data ?? []).map((m) => {
      const studio = m.studios as unknown as { id: string; name: string };
      return { id: studio.id, label: studio.name, kind: "studio" as const };
    }),
    ...(clientsRes.data ?? []).map((c) => ({
      id: c.id,
      label: c.full_name,
      kind: "private" as const,
    })),
  ];

  return <ContractorInvoicesManager invoices={invoices} clientOptions={clientOptions} />;
}
