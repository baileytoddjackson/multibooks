/**
 * Per-model request options. Keeps model-specific API differences in one place so swapping
 * MODEL_RUNTIME / MODEL_OFFLINE never needs code changes elsewhere.
 */
export const DEFAULT_MODEL = "claude-haiku-5-5";

export type Effort = "low" | "medium" | "high";

/** Models that reject `output_config.effort` (it 400s). */
const NO_EFFORT = [/^claude-haiku-4-5/, /^claude-sonnet-4-5/, /^claude-3/];

export function supportsEffort(model: string): boolean {
  return !NO_EFFORT.some((re) => re.test(model));
}

/**
 * Extra `output_config` fields for a model. Story segments are short and well specified, so
 * `low` effort keeps thinking (and cost) minimal on models that think adaptively.
 */
export function effortConfig(model: string, effort: Effort = "low"): { effort?: Effort } {
  return supportsEffort(model) ? { effort } : {};
}
