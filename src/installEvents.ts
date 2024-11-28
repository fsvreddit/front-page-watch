import { TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade } from "@devvit/protos";
import { CHECK_POSTS_CRON, CHECK_POSTS_JOB, CLEANUP_JOB, CLEANUP_JOB_CRON, GET_ALL_CRON, GET_ALL_JOB } from "./constants.js";
import { oneOffCleanupSchedule, scheduleAdhocCleanup } from "./cleanup.js";

export async function handleUpgradeEvents (_: AppInstall | AppUpgrade, context: TriggerContext) {
    const existingJobs = await context.scheduler.listJobs();
    await Promise.all(existingJobs.map(job => context.scheduler.cancelJob(job.id)));

    await context.scheduler.runJob({
        name: GET_ALL_JOB,
        cron: GET_ALL_CRON,
    });

    await context.scheduler.runJob({
        name: GET_ALL_JOB,
        runAt: new Date(),
    });

    await context.scheduler.runJob({
        name: CHECK_POSTS_JOB,
        cron: CHECK_POSTS_CRON,
    });

    await context.scheduler.runJob({
        name: CLEANUP_JOB,
        cron: CLEANUP_JOB_CRON,
    });

    await oneOffCleanupSchedule(context);
    await scheduleAdhocCleanup(context);

    console.log("Install: Jobs rescheduled.");
}
