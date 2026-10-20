-- Audit B-15: a student can have only one live parent auto-pay subscription per
-- class. The app-level check races on a double-click or two tabs; this index
-- makes the second insert fail so the action can cancel the extra Stripe sub.
create unique index if not exists subscriptions_one_live_autopay_per_class
  on public.subscriptions (student_id, class_id)
  where admin_created = false
    and class_id is not null
    and status in ('active', 'trialing', 'past_due', 'incomplete');
