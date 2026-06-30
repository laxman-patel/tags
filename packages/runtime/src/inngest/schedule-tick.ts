import { cron } from "inngest";
import type { InngestFunction } from "inngest";
import { inngest } from "./client";
import { evaluateAndFireSchedules } from "./evaluate-schedules";

/** Polls DB schedules every minute and enqueues due Space runs. */
export const scheduleTickFunction: InngestFunction.Any = inngest.createFunction(
  { id: "schedule-tick", triggers: [cron("* * * * *")] },
  async ({ step }) => {
    return step.run("evaluate-schedules", () => evaluateAndFireSchedules());
  },
);
