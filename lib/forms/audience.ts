// ============================================================================
//  Audience resolution — the pure half.
//
//  Two questions, one rule. "Who is this form about?" (the admin's recipient
//  count) and "does it cover this person of mine?" (the signer's list) have to
//  agree, or a studio sees 24 recipients while the families between them can
//  only reach 19 forms. Both are answered here from the same predicate, so
//  they cannot drift.
//
//  The audience always names *subjects* directly:
//    all    — every student (student scope) or every member (person scope)
//    role   — everyone holding that role
//    class  — the active roster of that class
//    person — that one profile
//
//  Who may sign for a subject is a separate question, answered by the caller:
//  the subject themselves, or a guardian of theirs.
// ============================================================================

import type { Role } from "@/lib/types";
import type { FormAudienceTarget, FormSubjectScope } from "./types";

export type AudienceSubject = {
  profileId: string;
  role: Role;
  /** Classes the subject is actively enrolled in. */
  classIds: Set<string>;
};

/** Does this one target cover this subject? */
export function targetCoversSubject(
  target: FormAudienceTarget,
  subject: AudienceSubject,
  subjectScope: FormSubjectScope,
): boolean {
  switch (target.kind) {
    case "all":
      return subjectScope === "person" || subject.role === "student";
    case "role":
      return target.role === subject.role;
    case "class":
      return subject.classIds.has(target.classId);
    case "person":
      return target.profileId === subject.profileId;
  }
}

/** Does the audience as a whole cover this subject? Targets are OR'd. */
export function audienceCoversSubject(
  audience: FormAudienceTarget[],
  subject: AudienceSubject,
  subjectScope: FormSubjectScope,
): boolean {
  return audience.some((target) => targetCoversSubject(target, subject, subjectScope));
}
