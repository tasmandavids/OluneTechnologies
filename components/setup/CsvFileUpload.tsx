"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { readTextFile } from "@/lib/setup/csv-file";

export function CsvFileUpload({
  label,
  onLoad,
  disabled,
}: {
  label: string;
  onLoad: (text: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("setup.csvUpload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    try {
      const text = await readTextFile(file);
      setFileName(file.name);
      onLoad(text);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : t("readError"));
      setFileName(null);
    }
    e.target.value = "";
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="sr-only"
        disabled={disabled}
        onChange={onFileChange}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-(--hair) bg-base/40 px-4 py-3 text-sm text-muted transition hover:border-brand/40 hover:text-ink disabled:opacity-50"
      >
        <span aria-hidden>📁</span>
        {fileName ? t("loaded", { fileName }) : label}
      </button>
      {fileError && (
        <p className="mt-1.5 text-xs text-red-400">{fileError}</p>
      )}
    </div>
  );
}
