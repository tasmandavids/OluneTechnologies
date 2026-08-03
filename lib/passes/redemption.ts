export type ClassPassRedemptionRollback = {
  status: "paid";
  redeemed_at: null;
  redeemed_class_id: null;
  redeemed_date: null;
  redeemed_by: null;
};

type RedemptionUpdateResult = { error: { message: string } | null };
type RedemptionUpdateChain = PromiseLike<RedemptionUpdateResult> & {
  eq(column: string, value: string): RedemptionUpdateChain;
};
type ClassPassRedemptionTable = {
  update(patch: ClassPassRedemptionRollback): RedemptionUpdateChain;
};
type ClassPassRedemptionClient = {
  from(table: "class_passes"): ClassPassRedemptionTable;
};

type RollbackClaimParams = {
  passId: string;
  studioId: string;
  classId: string;
  date: string;
  redeemedBy: string;
};

export async function rollbackRedeemedClassPassClaim(
  supabase: ClassPassRedemptionClient,
  params: RollbackClaimParams,
): Promise<string | null> {
  const { error } = await supabase
    .from("class_passes")
    .update({
      status: "paid",
      redeemed_at: null,
      redeemed_class_id: null,
      redeemed_date: null,
      redeemed_by: null,
    })
    .eq("id", params.passId)
    .eq("studio_id", params.studioId)
    .eq("status", "redeemed")
    .eq("redeemed_class_id", params.classId)
    .eq("redeemed_date", params.date)
    .eq("redeemed_by", params.redeemedBy);

  return error?.message ?? null;
}
