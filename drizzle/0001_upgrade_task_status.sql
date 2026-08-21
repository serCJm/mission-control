UPDATE `workspaces`
SET `data` = json_set(
  `data`,
  '$.tasks',
  json(COALESCE((
    SELECT json_group_array(json(
      json_remove(
        json_set(
          task.value,
          '$.status',
          CASE WHEN json_extract(task.value, '$.done') = 1 THEN 'done' ELSE 'todo' END
        ),
        '$.done'
      )
    ))
    FROM json_each(`workspaces`.`data`, '$.tasks') AS task
  ), '[]'))
)
WHERE EXISTS (
  SELECT 1
  FROM json_each(`workspaces`.`data`, '$.tasks') AS task
  WHERE json_type(task.value, '$.status') IS NULL
    AND json_type(task.value, '$.done') IN ('true', 'false')
);
