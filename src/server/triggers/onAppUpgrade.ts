import { TriggerResponse } from "@devvit/web/shared";
import { Context } from "hono";
import { handleUpgradeEvents } from "../core";

export const onAppUpgrade = async (c: Context): Promise<Response> => {
    await handleUpgradeEvents();

    return c.json<TriggerResponse>({ message: "App upgrade handled" }, 200);
};
