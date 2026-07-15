// ============================================================================
//  Private lesson booking — shared view-model types across the teacher,
//  parent, and admin surfaces. Mirrors public.private_lesson_bookings.
// ============================================================================

export const PRIVATE_LESSON_STATUSES = [
  "requested",
  "accepted",
  "declined",
  "cancelled",
] as const;

export type PrivateLessonStatus = (typeof PRIVATE_LESSON_STATUSES)[number];

/** A booking as seen by the teacher (their incoming/accepted requests). */
export type TeacherBooking = {
  id: string;
  studentName: string | null;
  parentName: string | null;
  lessonDate: string;
  startTime: string;
  endTime: string;
  locationName: string | null;
  parentNote: string | null;
  status: PrivateLessonStatus;
};

/** A booking as seen by the parent (their own requests). */
export type ParentBooking = {
  id: string;
  teacherName: string | null;
  studentName: string | null;
  lessonDate: string;
  startTime: string;
  endTime: string;
  locationName: string | null;
  parentNote: string | null;
  teacherResponseNote: string | null;
  status: PrivateLessonStatus;
};

/** A booking as seen by the admin review queue (all statuses + billing). */
export type AdminBooking = {
  id: string;
  teacherName: string | null;
  studentName: string | null;
  parentName: string | null;
  lessonDate: string;
  startTime: string;
  endTime: string;
  locationName: string | null;
  parentNote: string | null;
  status: PrivateLessonStatus;
  invoiceId: string | null;
  amountCents: number | null;
  invoiceStatus: string | null;
};

/** A studio teacher a parent can book, with their weekly availability. */
export type BookableTeacher = {
  id: string;
  name: string | null;
  slots: { dayOfWeek: number; startTime: string; endTime: string; notes: string | null }[];
};

/** A child the parent can book a lesson for. */
export type BookableChild = {
  studentId: string;
  name: string | null;
};

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
