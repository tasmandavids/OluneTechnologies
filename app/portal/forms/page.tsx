// ============================================================================
//  /portal/forms — forms and studio policies waiting on the signed-in person.
//  Role-agnostic on purpose: a teacher acknowledging a code of conduct and a
//  parent signing a medical form are the same screen.
// ============================================================================

import { FormsSurface } from "@/components/forms/FormsSurface";

export const dynamic = "force-dynamic";

export default async function PortalFormsPage() {
  return <FormsSurface />;
}
