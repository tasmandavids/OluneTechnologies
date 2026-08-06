"use client";

// ============================================================================
//  AudiencePicker — "who is this form for".
//
//  Three ways to answer, and they compose: everyone, whole groups (a role or a
//  class), or named individuals. "Everyone" is exclusive — picking it clears
//  the rest, because a form that goes to everyone plus Ballet A is just a form
//  that goes to everyone, and showing both invites the reader to think the
//  class narrowed it.
// ============================================================================

import { useMemo, useState } from "react";
import type { Role } from "@/lib/types";
import { ASSIGNABLE_ROLES, type FormAudienceTarget } from "@/lib/forms/types";

export type ClassOption = { id: string; name: string; discipline: string | null };
export type PersonOption = { id: string; name: string | null; email: string | null; role: Role };

const ROLE_LABELS: Record<Role, string> = {
  parent: "Parents & guardians",
  student: "Students",
  teacher: "Teachers",
  office: "Front desk",
  admin: "Studio admins",
};

export function AudiencePicker({
  value,
  onChange,
  classes,
  people,
}: {
  value: FormAudienceTarget[];
  onChange: (next: FormAudienceTarget[]) => void;
  classes: ClassOption[];
  people: PersonOption[];
}) {
  const [search, setSearch] = useState("");

  const everyone = value.some((t) => t.kind === "all");
  const roles = new Set(value.flatMap((t) => (t.kind === "role" ? [t.role] : [])));
  const classIds = new Set(value.flatMap((t) => (t.kind === "class" ? [t.classId] : [])));
  const personIds = new Set(value.flatMap((t) => (t.kind === "person" ? [t.profileId] : [])));

  function toggleEveryone() {
    onChange(everyone ? [] : [{ kind: "all" }]);
  }

  function withoutAll(targets: FormAudienceTarget[]): FormAudienceTarget[] {
    return targets.filter((t) => t.kind !== "all");
  }

  function toggleRole(role: Role) {
    const base = withoutAll(value);
    onChange(
      roles.has(role)
        ? base.filter((t) => !(t.kind === "role" && t.role === role))
        : [...base, { kind: "role", role }],
    );
  }

  function toggleClass(classId: string) {
    const base = withoutAll(value);
    onChange(
      classIds.has(classId)
        ? base.filter((t) => !(t.kind === "class" && t.classId === classId))
        : [...base, { kind: "class", classId }],
    );
  }

  function togglePerson(profileId: string) {
    const base = withoutAll(value);
    onChange(
      personIds.has(profileId)
        ? base.filter((t) => !(t.kind === "person" && t.profileId === profileId))
        : [...base, { kind: "person", profileId }],
    );
  }

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [] as PersonOption[];
    return people
      .filter(
        (p) =>
          (p.name ?? "").toLowerCase().includes(query) ||
          (p.email ?? "").toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [people, search]);

  const chosenPeople = people.filter((p) => personIds.has(p.id));

  return (
    <div className="space-y-4">
      <label
        className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
        style={{
          borderColor: everyone ? "var(--brand)" : "var(--hair)",
          background: everyone ? "color-mix(in srgb, var(--brand) 8%, transparent)" : "transparent",
        }}
      >
        <input
          type="checkbox"
          checked={everyone}
          onChange={toggleEveryone}
          className="mt-0.5 h-4 w-4 accent-[--brand]"
        />
        <span>
          <span className="block text-sm font-semibold text-ink">Everyone at the studio</span>
          <span className="block text-xs text-muted">
            Every current member. New people pick it up automatically.
          </span>
        </span>
      </label>

      <fieldset disabled={everyone} className={everyone ? "opacity-40" : ""}>
        <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Groups
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {ASSIGNABLE_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              className="rounded-full border px-3 py-1 text-xs font-semibold transition"
              style={{
                borderColor: roles.has(role) ? "var(--brand)" : "var(--hair)",
                color: roles.has(role) ? "var(--brand)" : "var(--muted)",
                background: roles.has(role)
                  ? "color-mix(in srgb, var(--brand) 10%, transparent)"
                  : "transparent",
              }}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Classes
        </p>
        {classes.length === 0 ? (
          <p className="text-xs text-muted">No classes yet.</p>
        ) : (
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {classes.map((klass) => (
              <button
                key={klass.id}
                type="button"
                onClick={() => toggleClass(klass.id)}
                className="rounded-full border px-3 py-1 text-xs font-semibold transition"
                style={{
                  borderColor: classIds.has(klass.id) ? "var(--brand)" : "var(--hair)",
                  color: classIds.has(klass.id) ? "var(--brand)" : "var(--muted)",
                  background: classIds.has(klass.id)
                    ? "color-mix(in srgb, var(--brand) 10%, transparent)"
                    : "transparent",
                }}
              >
                {klass.name}
                {klass.discipline ? ` · ${klass.discipline}` : ""}
              </button>
            ))}
          </div>
        )}

        <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Individuals
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-xl border px-3 py-2 text-sm text-ink"
          style={{ borderColor: "var(--hair)", background: "var(--base)" }}
        />
        {matches.length > 0 && (
          <div
            className="mt-1.5 overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--hair)" }}
          >
            {matches.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  togglePerson(person.id);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-[--glass2]"
              >
                <span className="text-ink">{person.name ?? person.email ?? "Unnamed"}</span>
                <span className="text-xs text-muted">
                  {ROLE_LABELS[person.role]}
                  {personIds.has(person.id) ? " · added" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
        {chosenPeople.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chosenPeople.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => togglePerson(person.id)}
                className="rounded-full border px-3 py-1 text-xs font-semibold transition"
                style={{
                  borderColor: "var(--brand)",
                  color: "var(--brand)",
                  background: "color-mix(in srgb, var(--brand) 10%, transparent)",
                }}
              >
                {person.name ?? person.email ?? "Unnamed"} ✕
              </button>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** One-line description of an audience, for the list rows. */
export function describeAudience(
  audience: FormAudienceTarget[],
  classes: ClassOption[],
  people: PersonOption[],
): string {
  if (audience.length === 0) return "Nobody yet";
  if (audience.some((t) => t.kind === "all")) return "Everyone at the studio";

  const parts: string[] = [];
  const roles = audience.flatMap((t) => (t.kind === "role" ? [t.role] : []));
  if (roles.length > 0) parts.push(roles.map((r) => ROLE_LABELS[r]).join(", "));

  const classNames = audience.flatMap((t) =>
    t.kind === "class" ? [classes.find((c) => c.id === t.classId)?.name ?? "a class"] : [],
  );
  if (classNames.length > 0) {
    parts.push(
      classNames.length <= 2 ? classNames.join(", ") : `${classNames.length} classes`,
    );
  }

  const personCount = audience.filter((t) => t.kind === "person").length;
  if (personCount === 1) {
    const target = audience.find((t) => t.kind === "person");
    const match =
      target?.kind === "person" ? people.find((p) => p.id === target.profileId) : undefined;
    parts.push(match?.name ?? match?.email ?? "1 person");
  } else if (personCount > 1) {
    parts.push(`${personCount} people`);
  }

  return parts.join(" · ");
}
