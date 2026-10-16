import { reddit, scheduler } from "@devvit/web/server";
import { SettingsValidationRequest, SettingsValidationResponse } from "@devvit/web/shared";
import type { Context } from "hono";
import { SchedulerJob } from "../core";

export const handleValidateFeedAndRequeue = async (c: Context): Promise<Response> => {
    const validationRequest = await c.req.json<SettingsValidationRequest<string>>();

    const { value } = validationRequest;

    if (!value) {
        return c.json<SettingsValidationResponse>({
            success: false,
            error: "You must enter a feed to monitor",
        });
    }

    try {
        await reddit.getHotPosts({
            subredditName: value,
            limit: 100,
        }).all();
    } catch {
        return c.json<SettingsValidationResponse>({
            success: false,
            error: `Cannot retrieve posts from r/${value}`,
        });
    }

    await scheduler.runJob({
        name: SchedulerJob.GetAll,
        runAt: new Date(),
        data: { jobGuid: crypto.randomUUID() },
    });

    return c.json<SettingsValidationResponse>({ success: true }, 200);
};
