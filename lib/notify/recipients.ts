// Who actually receives a notification that is about a student.
// Children have no phone, devices or routable email (their login is
// `xx01@students.olune.local`), so their reminders go to their guardians
// (audit E-04). A student with no guardian (an adult) is their own recipient.

export type GuardianLink = { student_id: string; guardian_id: string };

export function recipientsForStudents(
  studentIds: string[],
  guardianships: GuardianLink[],
): Map<string, string[]> {
  const guardiansOf = new Map<string, Set<string>>();
  for (const g of guardianships) {
    const set = guardiansOf.get(g.student_id) ?? new Set<string>();
    set.add(g.guardian_id);
    guardiansOf.set(g.student_id, set);
  }
  const out = new Map<string, string[]>();
  for (const id of studentIds) {
    const guardians = guardiansOf.get(id);
    out.set(id, guardians?.size ? [...guardians] : [id]);
  }
  return out;
}
