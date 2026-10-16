import type { Context } from "hono";
import { TaskRequest, TaskResponse } from "@devvit/web/server";
import { getPostsFromAll } from "../core";

export type GetPostsFromAllJobData = {
    jobGuid: string;
};

export const handleGetPostsFromAllJob = async (c: Context): Promise<Response> => {
    const request = await c.req.json<TaskRequest<GetPostsFromAllJobData>>();

    await getPostsFromAll(request);

    return c.json<TaskResponse>({ message: "Cleanup of known users list completed" }, 200);
};
