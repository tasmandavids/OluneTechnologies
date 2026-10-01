// ============================================================================
//  Bill attachments — what may be uploaded, shared by the dropzone (instant
//  feedback) and the server (the authoritative check).
//
//  The bucket (20261002100000_books_bill_inbox.sql) enforces the same size and
//  type limits, so a hand-rolled upload that skips both still gets refused.
// ============================================================================

export const BOOKS_ATTACHMENT_BUCKET = "books-attachments";

/** 20 MB — matches the bucket's file_size_limit. A phone photo of an invoice is 2–6 MB. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** At most this many documents per drop, so one action stays inside its time budget. */
export const MAX_FILES_PER_UPLOAD = 10;

const TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const ATTACHMENT_ACCEPT = Object.keys(TYPES).join(",");

export type AttachmentCheck = { ok: true; ext: string } | { ok: false; error: "attachmentType" | "attachmentSize" };

export function checkAttachment(mimeType: string, sizeBytes: number): AttachmentCheck {
  const ext = TYPES[mimeType];
  if (!ext) return { ok: false, error: "attachmentType" };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, error: "attachmentSize" };
  return { ok: true, ext };
}

/** The object path for a new attachment: always under the studio's own folder. */
export function attachmentPath(studioId: string, ext: string, rand: string): string {
  return `${studioId}/${rand}.${ext}`;
}

/** True only for a path inside this studio's folder that we could have minted. */
export function isStudioAttachmentPath(studioId: string, path: string): boolean {
  const prefix = `${studioId}/`;
  if (!path.startsWith(prefix)) return false;
  return /^[a-z0-9-]{8,80}\.(pdf|png|jpg|webp|heic|heif)$/.test(path.slice(prefix.length));
}

/** Models read PDFs and these image types; HEIC has to be converted first, so it's stored but not read. */
export function isReadableByModel(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
