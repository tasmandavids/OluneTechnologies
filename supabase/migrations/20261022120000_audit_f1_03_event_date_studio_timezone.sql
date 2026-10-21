-- Audit F1-03: the production wizard saved the first performance's local date
-- and curtain time as a UTC wall-clock, so a 7pm NZ recital displayed 12-13h
-- late. The code now converts with the studio timezone; this repairs old rows.
--
-- Only rows whose event_date is exactly the naive UTC reading of the first
-- performance are touched, so already-correct events and re-runs are no-ops.
with first_perf as (
  select distinct on (event_id) event_id, perf_date, curtain_up
  from public.event_performances
  order by event_id, perf_date, curtain_up
)
update public.events e
set event_date = ((fp.perf_date + fp.curtain_up) at time zone s.timezone)
from first_perf fp
join public.studios s on s.id = (select studio_id from public.events where id = fp.event_id)
where e.id = fp.event_id
  and s.timezone is not null
  and s.timezone <> 'UTC'
  and e.event_date = ((fp.perf_date + fp.curtain_up) at time zone 'UTC');
