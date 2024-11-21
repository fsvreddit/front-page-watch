import { JobContext, Post, SubredditInfo, TriggerContext, ZMember } from "@devvit/public-api";
import { AppSetting } from "./settings.js";
import pluralize from "pluralize";
import { addMinutes, addWeeks } from "date-fns";
import { uniq } from "lodash";

const POSTS_IN_ALL_KEY = "postsInAll";
const POST_QUEUE_KEY = "postQueueKey";

interface OrderedPost {
    post: Post;
    index: number;
}

async function getPositions (context: JobContext) {
    const settings = await context.settings.getAll();

    const minPosition = settings[AppSetting.MinPosition] as number | undefined;
    const maxPosition = settings[AppSetting.MaxPosition] as number | undefined;

    if (!minPosition || !maxPosition) {
        console.log("Misconfigured!");
        return { minPosition: 1, maxPosition: 100 };
    }

    if (minPosition > maxPosition) {
        console.log("Misconfigured!");
        return { minPosition: 1, maxPosition: 100 };
    }

    return { minPosition, maxPosition };
}

async function isSubredditNSFW (subredditName: string, context: JobContext) {
    const redisKey = `subNSFW:${subredditName}`;
    const isNSFW = await context.redis.get(redisKey);
    if (isNSFW) {
        return JSON.parse(isNSFW) as boolean;
    }

    let subredditInfo: SubredditInfo | undefined;
    try {
        subredditInfo = await context.reddit.getSubredditInfoByName(subredditName);
    } catch {
        //
    }

    const subNSFW = subredditInfo?.isNsfw ?? true;
    console.log(`r/${subredditName} NSFW: ${subNSFW}`);
    await context.redis.set(redisKey, JSON.stringify(subNSFW), { expiration: addWeeks(new Date(), 1) });
    return subNSFW;
}

export async function getPostsFromAll (_: unknown, context: JobContext) {
    const { minPosition, maxPosition } = await getPositions(context);

    const postsInAllResult = await context.reddit.getHotPosts({
        subredditName: "all",
        limit: maxPosition,
    }).all();

    const postsInAll: OrderedPost[] = [];

    const subredditNSFW: Record<string, boolean> = {};
    for (const subredditName of uniq(postsInAllResult.map(post => post.subredditName))) {
        subredditNSFW[subredditName] = await isSubredditNSFW(subredditName, context);
    }

    let index = 1;

    for (const post of postsInAllResult) {
        if (!post.nsfw && !subredditNSFW[post.subredditName] && index >= minPosition) {
            postsInAll.push({ post, index });
        }
        index++;
    }

    const existingRecords = await context.redis.zRange(POSTS_IN_ALL_KEY, 0, -1);

    const existingRecordsToRemove = existingRecords
        .filter(item => !postsInAll.some(post => post.post.id === item.member))
        .map(item => item.member);

    if (existingRecordsToRemove.length > 0) {
        await context.redis.zRem(POSTS_IN_ALL_KEY, existingRecordsToRemove);
        await context.redis.zRem(POST_QUEUE_KEY, existingRecordsToRemove);
        console.log(`Removed records for ${existingRecordsToRemove.length} ${pluralize("post", existingRecordsToRemove.length)} that ${pluralize("is", existingRecordsToRemove.length)} no longer in /r/all`);
    }

    const postsToAddToQueue = postsInAll.filter(post => !existingRecords.some(item => item.member === post.post.id));
    if (postsToAddToQueue.length > 0) {
        await context.redis.zAdd(POST_QUEUE_KEY, ...postsToAddToQueue.map(post => ({ member: post.post.id, score: new Date().getTime() })));
        console.log(`Added ${postsToAddToQueue.length} ${pluralize("post", postsToAddToQueue.length)} to queue that ${pluralize("is", postsToAddToQueue.length)} newly in /r/all`);
    }

    await context.redis.zAdd(POSTS_IN_ALL_KEY, ...postsInAll.map(item => ({ member: item.post.id, score: item.index })));
    console.log(`Stored ${postsInAll.length} ${pluralize("post", postsInAll.length)} in main redis key`);
}

export async function checkPosts (_: unknown, context: JobContext) {
    const { minPosition, maxPosition } = await getPositions(context);
    let itemsToCheck = Math.round((maxPosition - minPosition) / 18);
    if (itemsToCheck < 10) {
        itemsToCheck = 10;
    }

    const postsToCheck = await context.redis.zRange(POST_QUEUE_KEY, 0, itemsToCheck - 1, { by: "rank" });
    console.log(`Checking ${postsToCheck.length} ${pluralize("post", postsToCheck.length)}`);

    const itemsToRequeue: ZMember[] = [];
    for (const item of postsToCheck) {
        const post = await context.reddit.getPostById(item.member);
        if (post.removedByCategory !== "moderator") {
            itemsToRequeue.push({ member: post.id, score: addMinutes(new Date(), 5).getTime() });
            continue;
        }

        const score = await context.redis.zScore(POSTS_IN_ALL_KEY, item.member);
        if (score) {
            console.log(`Post ${item.member} is removed but was still in /r/all.`);
            await createPost(post, score, context);
        } else {
            console.log(`Post ${item.member} is removed, but isn't still in /r/all.`);
            continue;
        }

        await context.redis.zRem(POST_QUEUE_KEY, [item.member]);
    }

    if (itemsToRequeue.length > 0) {
        await context.redis.zAdd(POST_QUEUE_KEY, ...itemsToRequeue);
        console.log(`Queued ${itemsToRequeue.length} ${pluralize("post", itemsToRequeue.length)} for future checking.`);
    }
}

async function createPost (post: Post, index: number, context: TriggerContext) {
    const redisKey = `postMade:${post.id}`;
    const alreadyDone = await context.redis.get(redisKey);
    if (alreadyDone) {
        return;
    }
    console.log(post.permalink);
    const subredditName = context.subredditName ?? (await context.reddit.getCurrentSubreddit()).name;

    const newPostTitle = `[#${index}|+${post.score}|${post.numberOfComments}] ${post.title} [r/${post.subredditName}]`;
    const newPost = await context.reddit.submitPost({
        subredditName,
        url: `https://www.reddit.com/${post.permalink}`,
        title: newPostTitle,
    });

    console.log(`New post created for ${post.id}: https://www.reddit.com/${newPost.permalink}`);

    await context.redis.set(redisKey, new Date().getTime().toString(), { expiration: addWeeks(new Date(), 2) });
}
