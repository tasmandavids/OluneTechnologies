// ============================================================================
//  components/marketing/landing/data-deletion-data.ts — Data Deletion
//  Instructions copy. Kept out of the "use client" module for the same
//  reason as privacy-data.ts.
// ============================================================================

import type { LegalSection } from "@/components/marketing/landing/legal-prose";

export const DATA_DELETION_LAST_UPDATED = "16 July 2026";
export const DATA_DELETION_CONTACT_EMAIL = "support@olune.co.nz";
export const DATA_DELETION_ADDRESS = "4 Limes Avenue, Christchurch, Parklands, 8083";

export const DATA_DELETION_SECTIONS: LegalSection[] = [
  {
    heading: "Overview",
    paragraphs: [
      "This page explains how to request deletion of your personal information from Olune, the studio and club management platform provided by Olune Limited.",
      "As set out in our Privacy Policy, Olune serves two groups of people, and the right process depends on which one you are:",
    ],
    bullets: [
      "Customers — the studios, clubs, and organisations that subscribe to Olune, and their staff/administrators.",
      "End Users — the students, members, parents, or clients of a Customer, whose data a Customer has entered into or collected through the platform.",
    ],
  },
  {
    heading: "If you are an End User (student, member, parent, or guardian)",
    paragraphs: [
      "Your studio or club controls the data collected about you in Olune, so they are best placed to action a deletion request and are aware of any of their own retention obligations (for example, signed waivers or attendance records they must keep).",
    ],
    bullets: [
      "Contact your studio or club directly and ask them to delete your data. They can action this themselves from within their Olune account.",
      "If your studio or club is unresponsive, or is no longer operating, email support@olune.co.nz with your name, the studio or club name, and a description of the data you want deleted. We will verify the request and either action it directly or help route it to the studio.",
    ],
  },
  {
    heading: "If you are a Customer (studio or club owner/administrator)",
    bullets: [
      "You can delete individual records — such as a student, staff member, or class — directly from within your Olune admin dashboard, in the relevant section.",
      "To close your account and delete your studio or club's data entirely, email support@olune.co.nz from your account's registered email address, or reach us via in-app support. Include your studio name so we can locate your account.",
      "We will confirm your identity and the scope of the request before deleting anything.",
    ],
  },
  {
    heading: "What gets deleted",
    paragraphs: ["A completed deletion request removes:"],
    bullets: [
      "Account and profile information (names, contact details, login credentials).",
      "Enrolment, attendance, class, and membership records.",
      "Emergency contact and medical/allergy information, where recorded.",
      "Messages sent and received through the platform.",
      "Photos or videos uploaded to the account, where applicable.",
    ],
  },
  {
    heading: "",
    paragraphs: [
      "Some information may be retained beyond a deletion request where required by law (for example, financial or tax records), or where necessary to resolve a dispute or enforce our agreements — see Section 7 (Data Retention) of our Privacy Policy for details. Retained records are kept only for as long as legally necessary and are not used for any other purpose.",
    ],
  },
  {
    heading: "Timeframe",
    paragraphs: [
      "We aim to complete verified deletion requests within 30 days. If a request affects data a Customer's studio or club is legally required to retain, we will let you know what (if anything) cannot be deleted and why.",
    ],
  },
];
