import Link from "next/link";
import ProgressTracker from "@/components/admin/students/ProgressTracker";
import AttendanceHistory from "@/components/portal/shared/AttendanceHistory";
import CertificateDownloads from "@/components/portal/shared/CertificateDownloads";
import LevelBar from "@/components/portal/shared/LevelBar";
import BadgeShowcase from "@/components/portal/shared/BadgeShowcase";
import type { StudentProgressBundle } from "@/lib/portal/student-progress-data";
import type { StudentBadgeBundle } from "@/lib/portal/badges-data";

type Labels = {
  back: string;
  unnamedStudent: string;
  currentLevel: string;
  emptyProgress: string;
};

export default function StudentProgressPanel({
  bundle,
  badges,
  backHref,
  labels,
}: {
  bundle: StudentProgressBundle;
  badges?: StudentBadgeBundle | null;
  backHref: string;
  labels: Labels;
}) {
  const initials = (bundle.studentName ?? "?")
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <Link href={backHref} className="text-xs text-muted hover:text-ink">
          {labels.back}
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-black text-white"
            style={{ background: "var(--brand)" }}
          >
            {initials}
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">
              {bundle.studentName ?? labels.unnamedStudent}
            </h1>
            {bundle.latestLevel && (
              <p className="mt-0.5 text-sm text-muted">
                {labels.currentLevel}:{" "}
                <span className="font-semibold text-ink">{bundle.latestLevel}</span>
              </p>
            )}
            {bundle.classes.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                {bundle.classes
                  .map((c) => (c.level ? `${c.name} · ${c.level}` : c.name))
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {badges && (
        <>
          <LevelBar xp={badges.xp} />
          <BadgeShowcase
            badges={badges.showcase}
            earnedCount={badges.earnedCount}
            totalCount={badges.totalCount}
          />
        </>
      )}

      <CertificateDownloads certificates={bundle.certificates} />
      <AttendanceHistory records={bundle.attendance} />
      <ProgressTracker
        studentId={bundle.studentId}
        entries={bundle.entries}
        readOnly
        emptyMessage={labels.emptyProgress}
        certificateDownloadEnabled
      />
    </div>
  );
}
