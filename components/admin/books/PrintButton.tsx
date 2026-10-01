"use client";

import { useTranslations } from "next-intl";
import { secondaryButton, secondaryButtonStyle } from "./ui";

export function PrintButton() {
  const t = useTranslations("books.reports");
  return (
    <button type="button" className={`${secondaryButton} print:hidden`} style={secondaryButtonStyle} onClick={() => window.print()}>
      {t("print")}
    </button>
  );
}
