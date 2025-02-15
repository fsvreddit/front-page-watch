import { JobContext, Post, TriggerContext } from "@devvit/public-api";
import { parseExpression } from "cron-parser";
import { addDays, addMinutes, differenceInMinutes } from "date-fns";
import { CLEANUP_JOB, CLEANUP_JOB_CRON } from "./constants.js";
import pluralize from "pluralize";
import { getSettings } from "./settings.js";

const CLEANUP_KEY = "cleanupLog";
const CLEANUP_INTERVAL = 28;

export async function setCleanupForPost (localPostId: string, remotePostId: string, context: TriggerContext, overrideDate?: Date) {
    const cleanupDate = overrideDate ?? addDays(new Date(), CLEANUP_INTERVAL);
    await context.redis.zAdd(CLEANUP_KEY, { member: `${localPostId}:${remotePostId}`, score: cleanupDate.getTime() });
}

export async function handleCleanupJob (_: unknown, context: JobContext) {
    const itemsToCheck = await context.redis.zRange(CLEANUP_KEY, 0, new Date().getTime(), { by: "score" });

    if (itemsToCheck.length > 0) {
        for (const [localPostId, remotePostId] of itemsToCheck.slice(0, 20).map(item => item.member.split(":"))) {
            let remotePost: Post | undefined;
            try {
                remotePost = await context.reddit.getPostById(remotePostId);
            } catch (error) {
                const { verboseLogging } = await getSettings(context);
                if (verboseLogging) {
                    console.log(`Error retrieving post ${remotePostId}`);
                    console.log(error);
                }
            }

            if (!remotePost || remotePost.authorName === "[deleted]") {
                const localPost = await context.reddit.getPostById(localPostId);
                if (localPost.authorName !== "[deleted]") {
                    await localPost.delete();
                    console.log(`Cleanup: Post ${localPostId} has been deleted because the remote post has been deleted`);
                }
                await context.redis.zRem(CLEANUP_KEY, [`${localPostId}:${remotePostId}`]);
            } else {
                await setCleanupForPost(localPostId, remotePostId, context);
            }
        }
        console.log(`Cleanup: ${itemsToCheck.length} ${pluralize("post", itemsToCheck.length)} checked.`);
    } else {
        console.log("Cleanup: Nothing to do.");
    }

    await scheduleAdhocCleanup(context);
}

export async function scheduleAdhocCleanup (context: TriggerContext) {
    const nextEntries = await context.redis.zRange(CLEANUP_KEY, 0, 0, { by: "rank" });
    if (nextEntries.length === 0) {
        console.log("Cleanup Scheduler: Nothing in queue");
        return;
    }

    const nextDate = addMinutes(new Date(nextEntries[0].score), 5);
    const nextScheduledDate = parseExpression(CLEANUP_JOB_CRON).next().toDate();

    if (differenceInMinutes(nextScheduledDate, nextDate) < 2) {
        console.log("Cleanup Scheduler: Next due date is too close to next scheduled date.");
        return;
    }

    await context.scheduler.runJob({
        name: CLEANUP_JOB,
        runAt: nextDate < new Date() ? new Date() : nextDate,
    });

    console.log(`Cleanup Scheduler: Next ad-hoc job at ${nextDate.toUTCString()}`);
}

export function getRemotePostId (url: string): string | undefined {
    const regex = /\/r\/.+\/comments\/(\w+)\//;

    const matches = regex.exec(url);
    if (!matches) {
        return;
    }

    return `t3_${matches[1]}`;
}

export async function oneOffCleanupReschedule (context: TriggerContext) {
    const redisKey = "OneOffRescheduleCompleted";
    const alreadyDone = await context.redis.get(redisKey);
    if (alreadyDone) {
        return;
    }

    const allCleanup = await context.redis.zRange(CLEANUP_KEY, 0, -1);

    const randomMax = 60 * 24 * 7;

    const newEntries = allCleanup.map(item => ({ member: item.member, score: addMinutes(new Date(), Math.round(Math.random() * randomMax)).getTime() }));

    await context.redis.zAdd(CLEANUP_KEY, ...newEntries);

    console.log(`Scheduled ${newEntries.length} ${pluralize("post", newEntries.length)} for one-off cleanup`);

    await context.redis.set(redisKey, new Date().getTime().toString());
}
