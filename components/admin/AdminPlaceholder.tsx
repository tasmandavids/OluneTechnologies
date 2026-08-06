"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function AdminPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useTranslations("admin.placeholder");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl p-6"
    >
      <div className="box rounded-2xl px-8 py-14 text-center">
        <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-widest text-muted">
          {t("comingSoon")}
        </p>
        <h1 className="mb-3 text-2xl font-black text-ink">{title}</h1>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </motion.div>
  );
}
