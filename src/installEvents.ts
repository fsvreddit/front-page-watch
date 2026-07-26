import { TriggerContext } from "@devvit/public-api";
import { AppInstall, AppUpgrade } from "@devvit/protos";
import { SchedulerCron, SchedulerJob } from "./constants.js";
import { oneOffCleanupReschedule, scheduleAdhocCleanup } from "./cleanup.js";

export async function handleUpgradeEvents (_: AppInstall | AppUpgrade, context: TriggerContext) {
    const existingJobs = await context.scheduler.listJobs();
    await Promise.all(existingJobs.map(job => context.scheduler.cancelJob(job.id)));

    await context.scheduler.runJob({
        name: SchedulerJob.GetAll,
        cron: SchedulerCron.GetAll,
    });

    await context.scheduler.runJob({
        name: SchedulerJob.GetAll,
        runAt: new Date(),
    });

    await context.scheduler.runJob({
        name: SchedulerJob.CheckPosts,
        cron: SchedulerCron.CheckPosts,
    });

    await context.scheduler.runJob({
        name: SchedulerJob.Cleanup,
        cron: SchedulerCron.Cleanup,
    });

    await oneOffCleanupReschedule(context);
    await scheduleAdhocCleanup(context);

    console.log("Install: Jobs rescheduled.");
}
