import { z } from "zod";

import { SCENARIO_PRESETS } from "./scenarios";

/** Body contract for POST /api/demo/scenario (ARCHITECTURE §4). */
export const scenarioRequestSchema = z
  .object({
    action: z.enum([
      "trigger_detection",
      "second_signal",
      "kill_link",
      "restore_link",
      "set_ambient",
      "reset",
      "reset_world",
    ]),
    nodeId: z.string().trim().min(1).optional(),
    preset: z.enum(SCENARIO_PRESETS).optional(),
    /** Required by set_ambient. */
    enabled: z.boolean().optional(),
  })
  .strict();

export type ScenarioRequest = z.infer<typeof scenarioRequestSchema>;
