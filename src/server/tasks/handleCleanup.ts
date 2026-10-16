import type { Context } from "hono";
import { TaskRequest, TaskResponse } from "@devvit/web/server";
import { handleCleanup } from "../core";

export type CleanupJobData = {
    jobGuid: string;
};

export const handleCleanupJob = async (c: Context): Promise<Response> => {
    const request = await c.req.json<TaskRequest<CleanupJobData>>();

    await handleCleanup(request);

    return c.json<TaskResponse>({ message: "Cleanup of known users list completed" }, 200);
};
