-- ============================================================================
--  0079_class_capacity_room
--  Expose classes.room (the physical studio/room a class runs in — e.g.
--  "Studio 1", "Studio 2") through the class_capacity view so the admin
--  dashboard and classes list can assign + filter by it.
-- ============================================================================

create or replace view public.class_capacity
  with (security_invoker = on)
as
select
  c.id,
  c.studio_id,
  c.name,
  c.teacher_id,
  c.discipline,
  c.level,
  c.day_of_week,
  c.start_time,
  c.end_time,
  c.capacity,
  coalesce(
    count(e.id) filter (where e.status = 'active'),
    0
  )::int as enrolled,
  c.room
from public.classes c
left join public.enrollments e
  on e.class_id = c.id and e.studio_id = c.studio_id
group by c.id;

grant select on public.class_capacity to authenticated;
