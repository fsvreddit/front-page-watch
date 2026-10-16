import { TriggerResponse } from "@devvit/web/shared";
import { Context } from "hono";
import { handleUpgradeEvents } from "../core";

export const onAppInstall = async (c: Context): Promise<Response> => {
    await handleUpgradeEvents();

    return c.json<TriggerResponse>({ message: "App install handled" }, 200);
};
