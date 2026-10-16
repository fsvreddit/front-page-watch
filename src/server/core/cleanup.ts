import { Post, reddit, redis, scheduler, TaskRequest } from "@devvit/web/server";
import { T3 } from "@devvit/web/shared";
import { CronExpressionParser } from "cron-parser";
import { addDays, addMinutes, differenceInMinutes } from "date-fns";
import { SchedulerJob, SchedulerCron, getSettings } from ".";
import pluralize from "pluralize";
import { hasTriggerBeenHandled } from "@fsvreddit/fsv-devvit-web-helpers";
import { CleanupJobData } from "../tasks";

const CLEANUP_KEY = "cleanupLog";
const CLEANUP_INTERVAL = 28;

export async function setCleanupForPost (localPostId: string, remotePostId: string, overrideDate?: Date) {
    const cleanupDate = overrideDate ?? addDays(new Date(), CLEANUP_INTERVAL);
    await redis.zAdd(CLEANUP_KEY, { member: `${localPostId}:${remotePostId}`, score: cleanupDate.getTime() });
}

export async function handleCleanup (event: TaskRequest<CleanupJobData | undefined>) {
    const jobGuid = event.data?.jobGuid;
    if (jobGuid && await hasTriggerBeenHandled(`job:${jobGuid}`, { expiration: addMinutes(new Date(), 5) })) {
        console.warn(`Cleanup: Job ${jobGuid} has already been handled, skipping`);
        return;
    }

    const itemsToCheck = await redis.zRange(CLEANUP_KEY, 0, new Date().getTime(), { by: "score" });

    if (itemsToCheck.length > 0) {
        for (const [localPostId, remotePostId] of itemsToCheck.slice(0, 20).map(item => item.member.split(":"))) {
            let remotePost: Post | undefined;
            try {
                remotePost = await reddit.getPostById(remotePostId as T3);
            } catch (error) {
                const { verboseLogging } = await getSettings();
                if (verboseLogging) {
                    console.log(`Error retrieving post ${remotePostId}`);
                    console.log(error);
                }
            }

            if (!remotePost || remotePost.authorName === "[deleted]") {
                const localPost = await reddit.getPostById(localPostId as T3);
                if (localPost.authorName !== "[deleted]") {
                    await localPost.delete();
                    console.log(`Cleanup: Post ${localPostId} has been deleted because the remote post has been deleted`);
                }
                await redis.zRem(CLEANUP_KEY, [`${localPostId}:${remotePostId}`]);
            } else {
                await setCleanupForPost(localPostId as T3, remotePostId as T3);
            }
        }
        console.log(`Cleanup: ${itemsToCheck.length} ${pluralize("post", itemsToCheck.length)} checked.`);
    } else {
        console.log("Cleanup: Nothing to do.");
    }

    await scheduleAdhocCleanup();
}

export async function scheduleAdhocCleanup () {
    const nextEntries = await redis.zRange(CLEANUP_KEY, 0, 0, { by: "rank" });
    if (nextEntries.length === 0) {
        console.log("Cleanup Scheduler: Nothing in queue");
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const nextDate = addMinutes(new Date(nextEntries[0]!.score), 5);
    const nextScheduledDate = CronExpressionParser.parse(SchedulerCron.Cleanup).next().toDate();

    if (differenceInMinutes(nextScheduledDate, nextDate) < 2) {
        console.log("Cleanup Scheduler: Next due date is too close to next scheduled date.");
        return;
    }

    await scheduler.runJob<CleanupJobData>({
        name: SchedulerJob.Cleanup,
        runAt: nextDate < new Date() ? new Date() : nextDate,
        data: { jobGuid: crypto.randomUUID() },
    });

    console.log(`Cleanup Scheduler: Next ad-hoc job at ${nextDate.toUTCString()}`);
}

export function getRemotePostId (url: string): T3 | undefined {
    const regex = /\/r\/.+\/comments\/(\w+)\//;

    const matches = regex.exec(url);
    if (!matches) {
        return;
    }

    return `t3_${matches[1]}`;
}

export async function oneOffCleanupReschedule () {
    const redisKey = "OneOffRescheduleCompleted";
    const alreadyDone = await redis.get(redisKey);
    if (alreadyDone) {
        return;
    }

    const allCleanup = await redis.zRange(CLEANUP_KEY, 0, -1);

    const randomMax = 60 * 24 * 7;

    const newEntries = allCleanup.map(item => ({ member: item.member, score: addMinutes(new Date(), Math.round(Math.random() * randomMax)).getTime() }));

    await redis.zAdd(CLEANUP_KEY, ...newEntries);

    console.log(`Scheduled ${newEntries.length} ${pluralize("post", newEntries.length)} for one-off cleanup`);

    await redis.set(redisKey, new Date().getTime().toString());
}
