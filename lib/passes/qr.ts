export type DecodedClassPassQr = {
  passId: string;
  qrToken: string;
};

export type BuildClassPassQrPayloadInput = DecodedClassPassQr & {
  studentId: string;
  issuedAt: Date | string;
};

export function buildClassPassQrPayload({
  passId,
  qrToken,
  studentId,
  issuedAt,
}: BuildClassPassQrPayloadInput): string {
  return JSON.stringify({
    kind: "class_pass",
    pass_id: passId,
    qr_token: qrToken,
    student_id: studentId,
    issued_at: typeof issuedAt === "string" ? issuedAt : issuedAt.toISOString(),
  });
}

export function parseClassPassQrPayload(raw: string): DecodedClassPassQr | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data) || data.kind !== "class_pass") return null;

    const passId = nonEmptyString(data.pass_id);
    const qrToken = nonEmptyString(data.qr_token);
    if (!passId || !qrToken) return null;

    return { passId, qrToken };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.length > 0 ? value : null;
}
