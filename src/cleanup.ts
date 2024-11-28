import { JobContext, TriggerContext } from "@devvit/public-api";
import { parseExpression } from "cron-parser";
import { addDays, addMinutes, differenceInMinutes } from "date-fns";
import { CLEANUP_JOB, CLEANUP_JOB_CRON } from "./constants.js";
import pluralize from "pluralize";

const CLEANUP_KEY = "cleanupLog";
const CLEANUP_INTERVAL = 28;

export async function setCleanupForPost (localPostId: string, remotePostId: string, context: TriggerContext, overrideDate?: Date) {
    const cleanupDate = overrideDate ?? addDays(new Date(), CLEANUP_INTERVAL);
    await context.redis.zAdd(CLEANUP_KEY, { member: `${localPostId}:${remotePostId}`, score: cleanupDate.getTime() });
}

export async function handleCleanupJob (_: unknown, context: JobContext) {
    const itemsToCheck = await context.redis.zRange(CLEANUP_KEY, 0, new Date().getTime());

    if (itemsToCheck.length > 0) {
        for (const [localPostId, remotePostId] of itemsToCheck.slice(0, 20).map(item => item.member.split(":"))) {
            const remotePost = await context.reddit.getPostById(remotePostId);
            if (remotePost.authorName === "[deleted]") {
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
        runAt: nextDate,
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

export async function oneOffCleanupSchedule (context: TriggerContext) {
    const redisKey = "OneOffCleanupCompleted";
    const alreadyDone = await context.redis.get(redisKey);
    if (alreadyDone) {
        return;
    }

    await context.redis.del(CLEANUP_KEY);

    const subredditName = context.subredditName ?? (await context.reddit.getCurrentSubreddit()).name;
    const allPosts = await context.reddit.getNewPosts({
        subredditName,
        limit: 1000,
    }).all();

    for (const post of allPosts.filter(post => post.authorName === context.appName)) {
        const remotePostId = getRemotePostId(post.url);
        if (remotePostId) {
            await setCleanupForPost(post.id, remotePostId, context, addDays(post.createdAt, 5));
        }
    }

    console.log(`Scheduled ${allPosts.length} ${pluralize("post", allPosts.length)} for one-off cleanup`);

    await context.redis.set(redisKey, new Date().getTime().toString());
}
