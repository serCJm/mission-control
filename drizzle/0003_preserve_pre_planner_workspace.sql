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
  AND (
    COALESCE(json_type(`data`, '$.planner.areaBlockRules'), '') != 'array'
    OR COALESCE(json_type(`data`, '$.planner.areaBlockExceptions'), '') != 'array'
    OR COALESCE(json_type(`data`, '$.planner.blockItems'), '') != 'array'
  );
--> statement-breakpoint
UPDATE `workspaces`
SET `data` = CASE
  WHEN json_type(`data`, '$.planner') = 'object'
    AND json_type(`data`, '$.planner.areaBlockRules') = 'array'
    AND json_type(`data`, '$.planner.areaBlockExceptions') = 'array'
  THEN json_set(
    json_remove(
      `data`,
      '$.planner.projectSessions',
      '$.focusTaskIds',
      '$.currentAreaId'
    ),
    '$.planner.blockItems',
    json('[]')
  )
  ELSE json_set(
    json_remove(`data`, '$.planner', '$.focusTaskIds', '$.currentAreaId'),
    '$.planner',
    json('{"areaBlockRules":[],"areaBlockExceptions":[],"blockItems":[]}')
  )
END
WHERE `user_id` NOT LIKE 'archived:%'
  AND json_valid(`data`)
  AND (
    COALESCE(json_type(`data`, '$.planner.areaBlockRules'), '') != 'array'
    OR COALESCE(json_type(`data`, '$.planner.areaBlockExceptions'), '') != 'array'
    OR COALESCE(json_type(`data`, '$.planner.blockItems'), '') != 'array'
  );
