import { describe, expect, it } from "vitest";
import { countOutstandingForms, type AssignedForm, type FormResponseRecord, type StudioForm } from "@/lib/forms/types";

const form = (id: string, isRequired: boolean) => ({ id, isRequired }) as unknown as StudioForm;
const subj = (profileId: string) => ({ profileId, name: null, isSelf: false });
const resp = (formId: string, subjectId: string, signedAt: string | null): FormResponseRecord => ({
  formId, subjectId, signedAt, data: {}, signature: null, signatureType: null, signatureName: null, respondentId: null,
});

describe("countOutstandingForms", () => {
  const forms: AssignedForm[] = [
    { form: form("waiver", true), subjects: [subj("mia"), subj("leo")] },
    { form: form("photo", false), subjects: [subj("mia")] },
  ];

  it("counts each unsigned required form per child", () => {
    expect(countOutstandingForms(forms, [])).toBe(2);
  });

  it("ignores optional forms and signed responses", () => {
    expect(countOutstandingForms(forms, [resp("waiver", "mia", "2026-10-01")])).toBe(1);
  });

  it("treats a saved-but-unsigned draft as still outstanding", () => {
    expect(countOutstandingForms(forms, [resp("waiver", "mia", null), resp("waiver", "leo", "2026-10-01")])).toBe(1);
  });
});
