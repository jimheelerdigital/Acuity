-- Roadmap detail content for the 9 existing items (2026-10-19). DATA ONLY,
-- run after 2026-10-19-roadmap-details.sql. Every line is editable later in
-- /admin/roadmap. Copy describes only what is built (shipped / building) or
-- the idea as stated (considering), with no promised dates.

UPDATE "RoadmapItem" SET
  "category" = 'widgets',
  "problem" = 'Opening the app just to tick off one task is friction, and tasks you can''t see are tasks you forget.',
  "solution" = 'The Ripple Today widget puts your open tasks on your Home Screen, most pressing first: overdue, then due today, then high priority. Tap the circle to check one off without opening the app.',
  "highlights" = ARRAY[
    'Medium and large sizes for the Home Screen, plus a Lock Screen version with your open count',
    'Tap the circle to check a task off right from the widget',
    'Checked tasks stay struck through for a few minutes so you can undo a mis-tap',
    'Updates when you change tasks in the app'
  ],
  "howTo" = 'Press and hold an empty spot on your Home Screen, tap Edit, then Add Widget. Search for Ripple, choose Ripple Today, pick the medium or large size and tap Add Widget.'
WHERE "id" = 'rm_widget_tasks';

UPDATE "RoadmapItem" SET
  "category" = 'account',
  "problem" = 'Changing or cancelling a subscription shouldn''t mean digging through your phone''s settings.',
  "solution" = 'Profile now has a Manage subscription option. If you subscribe through the App Store or Google Play, it opens a subscription center inside Ripple. If you subscribe on the web, it opens your billing portal.',
  "highlights" = ARRAY[
    'Change plan or cancel from inside the app',
    'Restore a purchase on a new phone',
    'Request a refund or get help (App Store subscriptions)'
  ],
  "howTo" = 'Open Profile (the settings button on Home), then tap Manage subscription.'
WHERE "id" = 'rm_customer_center';

UPDATE "RoadmapItem" SET
  "category" = 'tasks',
  "problem" = 'A long task list makes it hard to see what actually needs you today.',
  "solution" = 'Home now opens with TODAY: the tasks that need attention first. Overdue tasks come first, then anything due today, then high priority.',
  "highlights" = ARRAY[
    'Overdue first, then due today, then high priority',
    'Built from the tasks Ripple pulls out of your debriefs, plus any you add yourself'
  ],
  "howTo" = 'Open the app. TODAY is at the top of Home.'
WHERE "id" = 'rm_today';

UPDATE "RoadmapItem" SET
  "category" = 'journaling',
  "timeframe" = 'Next app update',
  "problem" = 'Some days you can''t talk out loud: you''re on a train, in an office, or someone''s asleep in the next room. You still want to get it out of your head.',
  "solution" = 'Type your entry instead of recording it. Ripple treats it exactly like a spoken debrief, so you get the same tasks, themes and insights.',
  "highlights" = ARRAY[
    'Tap Type it instead on the record screen',
    'Write it the way you''d say it. A sentence or two is enough',
    'Same tasks, themes and insights as a voice entry'
  ]
WHERE "id" = 'rm_typed_entry';

UPDATE "RoadmapItem" SET
  "category" = 'journaling',
  "timeframe" = 'Next app update',
  "problem" = 'If you already keep a paper journal, retyping it is a chore, so those pages never get the insights your spoken entries do.',
  "solution" = 'Take a photo of a handwritten page and Ripple turns the handwriting into text. You review it, fix anything it misread, and save it like any other entry.',
  "highlights" = ARRAY[
    'Tap the camera button while typing an entry, then take a photo or choose one from your library',
    'The text goes into your draft so you can review it before saving',
    'Same tasks, themes and insights as any other entry'
  ]
WHERE "id" = 'rm_handwriting';

UPDATE "RoadmapItem" SET
  "category" = 'habits',
  "problem" = 'Miss a single day and a long streak resets to zero. That one miss can be enough to make people stop altogether.',
  "solution" = 'Earn a freeze every few days of keeping your streak. A freeze covers a missed day automatically, so one off day doesn''t erase weeks of consistency.'
WHERE "id" = 'rm_streak_freeze';

UPDATE "RoadmapItem" SET
  "category" = 'insights',
  "problem" = 'You log your energy and what you got done, but it''s hard to see how the two affect each other.',
  "solution" = 'A weekly card that puts your energy next to what you completed, so patterns stand out, like which days you get the most done or what tends to drain you.'
WHERE "id" = 'rm_energy_card';

UPDATE "RoadmapItem" SET
  "category" = 'insights',
  "problem" = 'It''s easy to lose track of how much has changed, or hasn''t, over a month.',
  "solution" = 'A gentle look back at what was on your mind about 30 days ago, shown next to today, so you can see what you''ve resolved and what keeps coming up.'
WHERE "id" = 'rm_echo';

UPDATE "RoadmapItem" SET
  "category" = 'journaling',
  "problem" = 'Some people think best with a pen in hand.',
  "solution" = 'A version of Ripple for iPad where you write entries by hand with Apple Pencil, and they get the same tasks, themes and insights as any other entry.'
WHERE "id" = 'rm_ipad';
