const titleCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export const TASK_SORT_OPTIONS = ["custom", "alphabetical", "dueDate", "priority"];

export function isTaskSort(value) {
  return TASK_SORT_OPTIONS.includes(value);
}

export function sortTasks(tasks, sort) {
  if (sort === "custom") return [...tasks];

  const priorityRank = { high: 0, medium: 1, low: 2 };

  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      if (left.task.done !== right.task.done) return left.task.done ? 1 : -1;

      let result = 0;
      if (sort === "alphabetical") {
        result = titleCollator.compare(left.task.title, right.task.title);
      } else if (sort === "dueDate") {
        const leftDate = left.task.dueDate || "\uffff";
        const rightDate = right.task.dueDate || "\uffff";
        result = leftDate.localeCompare(rightDate);
      } else if (sort === "priority") {
        const leftRank = priorityRank[left.task.priority] ?? 3;
        const rightRank = priorityRank[right.task.priority] ?? 3;
        result = leftRank - rightRank;
      }

      return result || left.index - right.index;
    })
    .map(({ task }) => task);
}
