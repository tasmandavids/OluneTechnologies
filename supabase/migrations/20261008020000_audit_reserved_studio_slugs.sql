-- Audit R-14: studio slugs become <slug>.olune.co.nz, so names that read as
-- Olune itself (support, billing, login, ...) are a phishing surface.
-- NOT VALID leaves existing rows alone; every new insert/update is checked,
-- whichever creation path (RPC, dashboard, script) it comes through.
alter table public.studios
  add constraint studios_slug_not_reserved
  check (lower(slug) <> all (array[
    'www', 'app', 'api', 'admin', 'administrator', 'platform', 'support', 'help',
    'billing', 'payments', 'pay', 'login', 'signin', 'signup', 'register', 'auth',
    'account', 'accounts', 'status', 'security', 'mail', 'email', 'smtp', 'ftp',
    'dashboard', 'portal', 'olune', 'official', 'staff', 'team', 'legal', 'terms',
    'privacy', 'dpa', 'refunds', 'docs', 'blog', 'cdn', 'static', 'assets', 'root'
  ])) not valid;
