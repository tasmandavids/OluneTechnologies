import { createClient } from "@/lib/supabase/server";
import { SubstituteBoardTeacher } from "@/components/portal/teacher/SubstituteBoardTeacher";
import { studioLocalYmd } from "@/lib/date/studio-date";

export type SubRequest = {
  id: string;
  studioName: string;
  className: string;
  discipline: string | null;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  status: "open" | "filled" | "cancelled";
  filledByName: string | null;
  isFilledByMe: boolean;
};

export default async function TeacherSubstitutesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("substitute_requests")
    .select(`
      id, class_name, discipline, date, start_time, end_time, notes, status, filled_by,
      studios!inner ( name ),
      filler:profiles!filled_by ( full_name )
    `)
    .gte("date", studioLocalYmd())
    .order("date")
    .order("start_time")
    .limit(60);

  const requests: SubRequest[] = (data ?? []).map((r) => {
    const studio = r.studios as unknown as { name: string };
    const filler = r.filler as unknown as { full_name: string | null } | null;
    return {
      id: r.id,
      studioName: studio?.name ?? "Studio",
      className: r.class_name,
      discipline: r.discipline ?? null,
      date: r.date,
      startTime: (r.start_time as string).slice(0, 5),
      endTime: (r.end_time as string).slice(0, 5),
      notes: r.notes ?? null,
      status: r.status as SubRequest["status"],
      filledByName: filler?.full_name ?? null,
      isFilledByMe: r.filled_by === user!.id,
    };
  });

  return <SubstituteBoardTeacher requests={requests} />;
}
