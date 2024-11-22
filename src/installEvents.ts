import { TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade } from "@devvit/protos";
import { CHECK_POSTS_CRON, CHECK_POSTS_JOB, GET_ALL_CRON, GET_ALL_JOB, SUB_NSFW_CHECK } from "./constants.js";
import { addMinutes } from "date-fns";

export async function handleInstallEvent (_: AppInstall, context: TriggerContext) {
    await handleUpgradeEvents(_, context);
    await context.scheduler.runJob({
        name: SUB_NSFW_CHECK,
        runAt: new Date(),
    });
}

export async function handleUpgradeEvents (_: AppInstall | AppUpgrade, context: TriggerContext) {
    const existingJobs = await context.scheduler.listJobs();
    await Promise.all(existingJobs.map(job => context.scheduler.cancelJob(job.id)));

    await context.scheduler.runJob({
        name: GET_ALL_JOB,
        cron: GET_ALL_CRON,
    });

    // Run initial gather job on a 5 minute delay, in order to let initial sub cache populate.
    await context.scheduler.runJob({
        name: GET_ALL_JOB,
        runAt: addMinutes(new Date(), 5),
    });

    await context.scheduler.runJob({
        name: CHECK_POSTS_JOB,
        cron: CHECK_POSTS_CRON,
    });
}
