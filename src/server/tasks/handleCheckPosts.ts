import type { Context } from "hono";
import { TaskResponse } from "@devvit/web/server";
import { checkPosts } from "../core";

export const handleCheckPostsJob = async (c: Context): Promise<Response> => {
    await checkPosts();

    return c.json<TaskResponse>({ message: "Check posts job completed" }, 200);
};
