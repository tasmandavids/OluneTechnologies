-- ============================================================================
--  0089 — Badge catalogue + level ladder seed (global rows, studio_id = null)
--
--  Seeds every badge named in the Olune achievement design, grouped by
--  category, plus the 5-tier XP level ladder. Idempotent: re-running updates
--  content in place (on conflict on the global-key partial unique index from
--  0088). Studios inherit these automatically and may hide any of them or add
--  their own via studio_badge_visibility / studio-custom badge_definitions.
--
--  XP by tier: bronze 100 · silver 250 · gold 500 · diamond 1000.
-- ============================================================================

-- ─── Level ladder (Little Dancer → Étoile) ──────────────────────────────────
insert into public.xp_levels (level, name, icon, min_xp, max_xp) values
  (1, 'Little Dancer', '🌱', 0,     500),
  (2, 'Young Artist',  '🌸', 500,   2000),
  (3, 'Rising Star',   '⭐', 2000,  5000),
  (4, 'Ballet Artist', '🩰', 5000,  10000),
  (5, 'Étoile',        '👑', 10000, null)
on conflict (level) do update set
  name = excluded.name, icon = excluded.icon,
  min_xp = excluded.min_xp, max_xp = excluded.max_xp;

-- ─── Badge catalogue ────────────────────────────────────────────────────────
insert into public.badge_definitions
  (studio_id, key, category, name, description, icon, tier, xp, is_secret, recipient_type, sort)
values
  -- Founder & Legacy
  (null, 'founder',              'founder', 'Founder',            'First student enrolled at the academy · founding member', '👑', 'diamond', 1000, false, 'student', 10),
  (null, 'first_steps',          'founder', 'First Steps',        'Completed first ballet class',                            '🌱', 'bronze',  100,  false, 'student', 11),
  (null, 'legacy_student',       'founder', 'Legacy Student',     '5+ years at the same academy',                            '🏛️', 'diamond', 1000, false, 'student', 12),
  (null, 'diamond_member',       'founder', 'Diamond Member',     '10+ years dancing at the academy',                        '💎', 'diamond', 1000, false, 'student', 13),
  (null, 'original_cast',        'founder', 'Original Cast',      'Participated in the school''s first major production',     '🦢', 'gold',    500,  false, 'student', 14),
  (null, 'pioneer',              'founder', 'Pioneer',            'Helped launch a new class, programme, or initiative',     '⭐', 'gold',    500,  false, 'student', 15),

  -- Beginner Journey
  (null, 'first_position',       'beginner', 'First Position',    'Learned first ballet position',                           '🩰', 'bronze',  100,  false, 'student', 20),
  (null, 'little_blossom',       'beginner', 'Little Blossom',    'Completed first term',                                    '🌸', 'bronze',  100,  false, 'student', 21),
  (null, 'ballet_butterfly',     'beginner', 'Ballet Butterfly',  'Completed beginner level',                                '🦋', 'silver',  250,  false, 'student', 22),
  (null, 'tiny_tendus',          'beginner', 'Tiny Tendus',       'Mastered first ballet vocabulary',                        '🐇', 'bronze',  100,  false, 'student', 23),
  (null, 'ribbon_ready',         'beginner', 'Ribbon Ready',      'First uniform fitted',                                    '🎀', 'bronze',  100,  false, 'student', 24),
  (null, 'stage_sparkle',        'beginner', 'Stage Sparkle',     'First performance',                                       '✨', 'bronze',  100,  false, 'student', 25),

  -- Commitment & Discipline
  (null, 'dedicated_dancer',     'commitment', 'Dedicated Dancer',      '10 consecutive classes attended',           '🔥', 'silver',  250,  false, 'student', 30),
  (null, 'practice_warrior',     'commitment', 'Practice Warrior',      'Logged 10 hours of practice',               '⚡', 'silver',  250,  false, 'student', 31),
  (null, 'early_morning_etoile', 'commitment', 'Early Morning Étoile',  'Attended early morning training',           '🌙', 'bronze',  100,  false, 'student', 32),
  (null, 'club_100',             'commitment', '100 Club',              '100 classes completed',                     '🏅', 'silver',  250,  false, 'student', 33),
  (null, 'club_500',             'commitment', '500 Club',              '500 classes completed',                     '🏆', 'gold',    500,  false, 'student', 34),
  (null, 'club_1000',            'commitment', '1000 Club',             '1,000 classes completed',                   '👑', 'diamond', 1000, false, 'student', 35),
  (null, 'perfect_attendance',   'commitment', 'Perfect Attendance',    'Perfect attendance for a term',             '📅', 'silver',  250,  false, 'student', 36),
  (null, 'consistency_champion', 'commitment', 'Consistency Champion',  '90%+ attendance over a year',               '🕰️', 'gold',    500,  false, 'student', 37),

  -- Technique
  (null, 'port_de_bras_master',  'technique', 'Port de Bras Master',  'Demonstrated beautiful arm placement',        '🦢', 'silver', 250, false, 'student', 40),
  (null, 'turnout_technician',   'technique', 'Turnout Technician',   'Improved turnout and alignment',              '🌹', 'silver', 250, false, 'student', 41),
  (null, 'strong_foundations',   'technique', 'Strong Foundations',   'Mastered barre fundamentals',                 '🦵', 'silver', 250, false, 'student', 42),
  (null, 'mirror_moment',        'technique', 'Mirror Moment',        'Demonstrated excellent self-correction',      '🪞', 'bronze', 100, false, 'student', 43),
  (null, 'precision_dancer',     'technique', 'Precision Dancer',     'Consistent technique execution',              '🎯', 'gold',   500, false, 'student', 44),
  (null, 'balance_master',       'technique', 'Balance Master',       'Developed strong balance',                    '🩰', 'silver', 250, false, 'student', 45),
  (null, 'pirouette_pioneer',    'technique', 'Pirouette Pioneer',    'Achieved first clean pirouette',              '🌪️', 'silver', 250, false, 'student', 46),
  (null, 'turning_titan',        'technique', 'Turning Titan',        'Multiple consecutive turns',                  '🚀', 'gold',   500, false, 'student', 47),
  (null, 'adagio_artist',        'technique', 'Adagio Artist',        'Developed controlled slow movement',          '🪽', 'silver', 250, false, 'student', 48),
  (null, 'allegro_ace',          'technique', 'Allegro Ace',          'Developed jumps and speed',                   '⚡', 'silver', 250, false, 'student', 49),

  -- Level Progression
  (null, 'seedling',             'level', 'Seedling',            'Pre-ballet completed',                             '🌱', 'bronze',  100,  false, 'student', 50),
  (null, 'level_young_artist',   'level', 'Young Artist',        'Primary level completed',                          '🌿', 'silver',  250,  false, 'student', 51),
  (null, 'level_rising_star',    'level', 'Rising Star',         'Grade level completed',                            '🌸', 'silver',  250,  false, 'student', 52),
  (null, 'studio_star',          'level', 'Studio Star',         'Intermediate level completed',                     '⭐', 'gold',    500,  false, 'student', 53),
  (null, 'future_professional',  'level', 'Future Professional', 'Advanced training completed',                      '🩰', 'gold',    500,  false, 'student', 54),
  (null, 'etoile_candidate',     'level', 'Étoile Candidate',    'Highest academy level achieved',                   '🦢', 'diamond', 1000, false, 'student', 55),

  -- Performance
  (null, 'first_curtain_call',   'performance', 'First Curtain Call',   'First stage performance',                   '🎭', 'bronze',  100,  false, 'student', 60),
  (null, 'spotlight_moment',     'performance', 'Spotlight Moment',     'Featured role in performance',              '🌟', 'silver',  250,  false, 'student', 61),
  (null, 'principal_dancer',     'performance', 'Principal Dancer',     'Lead role achieved',                        '👑', 'gold',    500,  false, 'student', 62),
  (null, 'swan_award',           'performance', 'Swan Award',           'Outstanding performance',                   '🦢', 'gold',    500,  false, 'student', 63),
  (null, 'character_artist',     'performance', 'Character Artist',     'Excellent acting / expression',             '🎼', 'silver',  250,  false, 'student', 64),
  (null, 'storyteller',          'performance', 'Storyteller',          'Demonstrated emotional artistry',           '🎨', 'silver',  250,  false, 'student', 65),
  (null, 'season_performer',     'performance', 'Season Performer',     'Completed full production season',          '🎟️', 'silver',  250,  false, 'student', 66),
  (null, 'theatre_professional', 'performance', 'Theatre Professional', 'Performed in an external venue',            '🏛️', 'gold',    500,  false, 'student', 67),

  -- Character & Values
  (null, 'kind_heart',           'character', 'Kind Heart',           'Demonstrates kindness to classmates',        '💙', 'bronze', 100, false, 'student', 70),
  (null, 'role_model',           'character', 'Role Model',           'Inspires younger dancers',                   '🌟', 'silver', 250, false, 'student', 71),
  (null, 'studio_ambassador',    'character', 'Studio Ambassador',    'Represents the school positively',           '🤍', 'silver', 250, false, 'student', 72),
  (null, 'growth_mindset',       'character', 'Growth Mindset',       'Shows improvement through effort',           '🌱', 'bronze', 100, false, 'student', 73),
  (null, 'team_player',          'character', 'Team Player',          'Supports classmates',                        '🫶', 'bronze', 100, false, 'student', 74),
  (null, 'positive_energy',      'character', 'Positive Energy',      'Brings enthusiasm to class',                 '👏', 'bronze', 100, false, 'student', 75),
  (null, 'focused_mind',         'character', 'Focused Mind',         'Excellent concentration',                    '🧘', 'bronze', 100, false, 'student', 76),
  (null, 'grace_beyond_ballet',  'character', 'Grace Beyond Ballet',  'Exemplary behaviour',                        '🕊️', 'silver', 250, false, 'student', 77),

  -- Teacher / Mentor Pathway
  (null, 'young_assistant',      'mentor', 'Young Assistant',      'Assisted a junior class',                       '🪶', 'silver', 250, false, 'student', 80),
  (null, 'future_teacher',       'mentor', 'Future Teacher',       'Completed teaching hours',                      '🌟', 'gold',   500, false, 'student', 81),
  (null, 'junior_mentor',        'mentor', 'Junior Mentor',        'Mentored younger dancers',                      '👩‍🏫', 'gold', 500, false, 'student', 82),
  (null, 'academy_ambassador',   'mentor', 'Academy Ambassador',   'Represents the school externally',              '🏛️', 'gold',   500, false, 'student', 83),
  (null, 'teaching_apprentice',  'mentor', 'Teaching Apprentice',  'Completed teacher training',                    '🎓', 'gold',   500, false, 'student', 84),

  -- Community
  (null, 'dance_explorer',       'community', 'Dance Explorer',       'Attended workshops',                        '🌎', 'bronze', 100, false, 'student', 90),
  (null, 'international_artist',  'community', 'International Artist',  'Participated overseas',                     '✈️', 'gold',   500, false, 'student', 91),
  (null, 'community_champion',    'community', 'Community Champion',   'Volunteering achievement',                  '🤝', 'silver', 250, false, 'student', 92),
  (null, 'fundraising_star',      'community', 'Fundraising Star',     'Supported school fundraising',              '🎗️', 'silver', 250, false, 'student', 93),
  (null, 'studio_influencer',     'community', 'Studio Influencer',    'Promoted the school positively',            '📸', 'silver', 250, false, 'student', 94),

  -- Secret / Fun (hidden until earned)
  (null, 'ballet_unicorn',       'secret', 'Ballet Unicorn',      'Secret challenge',                              '🦄', 'gold',   500, true, 'student', 100),
  (null, 'busy_bee',             'secret', 'Busy Bee',            'Attended 5 extra classes',                      '🐝', 'silver', 250, true, 'student', 101),
  (null, 'never_give_up',        'secret', 'Never Give Up',       'Overcame a difficult challenge',                '🥇', 'gold',   500, true, 'student', 102),
  (null, 'lost_shoe_legend',     'secret', 'Lost Shoe Legend',    'A funny studio moment',                         '🧦', 'bronze', 100, true, 'student', 103),
  (null, 'teachers_favourite',   'secret', 'Teacher''s Favourite','Outstanding effort',                            '☕', 'silver', 250, true, 'student', 104),
  (null, 'mirror_master',        'secret', 'Mirror Master',       'Perfect corrections in class',                  '🪞', 'silver', 250, true, 'student', 105),
  (null, 'silent_swan',          'secret', 'Silent Swan',         'Beautiful quiet discipline',                    '🦢', 'bronze', 100, true, 'student', 106),

  -- Parent / Family (awarded to parents)
  (null, 'supportive_family',    'family', 'Supportive Family',   'Consistent support of your dancer',             '💗', 'bronze', 100, false, 'parent', 110),
  (null, 'first_year_complete',  'family', 'First Year Complete', 'One full year with the academy',                '🎉', 'silver', 250, false, 'parent', 111),
  (null, 'production_family',     'family', 'Production Family',    'Supported a full production season',           '🎭', 'silver', 250, false, 'parent', 112)
on conflict (key) where studio_id is null do update set
  category       = excluded.category,
  name           = excluded.name,
  description    = excluded.description,
  icon           = excluded.icon,
  tier           = excluded.tier,
  xp             = excluded.xp,
  is_secret      = excluded.is_secret,
  recipient_type = excluded.recipient_type,
  sort           = excluded.sort,
  is_active      = true;
