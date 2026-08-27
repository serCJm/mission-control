INSERT INTO `workspaces` (`user_id`, `data`, `updated_at`)
SELECT
  'archived:'
    || CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    || ':'
    || lower(hex(randomblob(16)))
    || ':'
    || `user_id`,
  `data`,
  `updated_at`
FROM `workspaces`
WHERE `user_id` NOT LIKE 'archived:%'
  AND json_valid(`data`)
  AND json_type(`data`, '$.planner.projectSessions') = 'array'
  AND json_type(`data`, '$.planner.blockItems') IS NULL;
--> statement-breakpoint
UPDATE `workspaces`
SET `data` = json_set(
  json_remove(
    `data`,
    '$.planner.projectSessions',
    '$.focusTaskIds',
    '$.currentAreaId'
  ),
  '$.planner.blockItems',
  json('[]')
)
WHERE `user_id` NOT LIKE 'archived:%'
  AND json_valid(`data`)
  AND json_type(`data`, '$.planner.projectSessions') = 'array'
  AND json_type(`data`, '$.planner.blockItems') IS NULL;
