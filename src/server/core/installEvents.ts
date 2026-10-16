import { scheduler } from "@devvit/web/server";
import { SchedulerCron, SchedulerJob } from "./constants.js";
import { oneOffCleanupReschedule, scheduleAdhocCleanup } from "./cleanup.js";

export async function handleUpgradeEvents () {
    const existingJobs = await scheduler.listJobs();
    await Promise.all(existingJobs.map(job => scheduler.cancelJob(job.id)));

    await scheduler.runJob({
        name: SchedulerJob.GetAll,
        cron: SchedulerCron.GetAll,
    });

    await scheduler.runJob({
        name: SchedulerJob.GetAll,
        runAt: new Date(),
    });

    await scheduler.runJob({
        name: SchedulerJob.CheckPosts,
        cron: SchedulerCron.CheckPosts,
    });

    await scheduler.runJob({
        name: SchedulerJob.Cleanup,
        cron: SchedulerCron.Cleanup,
    });

    await oneOffCleanupReschedule();
    await scheduleAdhocCleanup();

    console.log("Install: Jobs rescheduled.");
}
