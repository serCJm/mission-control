const DEFAULT_AREA_BLOCK_FILL = "sage";

export function recoverCalendarBlockWorkspace(value) {
  if (!value || typeof value !== "object" || !value.planner || typeof value.planner !== "object") return null;
  const planner = value.planner;
  if (planner.blockRules !== undefined || planner.blockExceptions !== undefined) return null;
  if (!Array.isArray(planner.areaBlockRules) || !Array.isArray(planner.areaBlockExceptions) || !Array.isArray(planner.blockItems)) return null;

  const blockRules = planner.areaBlockRules.map((rule) => {
    if (!rule || typeof rule !== "object" || typeof rule.areaId !== "string" || rule.kind !== undefined || rule.title !== undefined) return null;
    return { ...rule, kind: "area", fill: rule.fill ?? DEFAULT_AREA_BLOCK_FILL };
  });
  if (blockRules.some((rule) => rule === null)) return null;

  const plannerRest = Object.fromEntries(Object.entries(planner).filter(([key]) => key !== "areaBlockRules" && key !== "areaBlockExceptions"));
  return {
    ...value,
    planner: {
      ...plannerRest,
      blockRules,
      blockExceptions: planner.areaBlockExceptions,
    },
  };
}
