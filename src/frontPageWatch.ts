import { JobContext, Post, SubredditInfo, TriggerContext, ZMember } from "@devvit/public-api";
import { AppSetting } from "./settings.js";
import pluralize from "pluralize";
import { addDays, addMinutes, addWeeks } from "date-fns";
import { setCleanupForPost } from "./cleanup.js";

const POSTS_IN_ALL_KEY = "postsInAll";
const POST_QUEUE_KEY = "postQueueKey";

interface OrderedPost {
    post: Post;
    index: number;
}

async function getSettings (context: JobContext) {
    const settings = await context.settings.getAll();

    const minPosition = settings[AppSetting.MinPosition] as number | undefined;
    const maxPosition = settings[AppSetting.MaxPosition] as number | undefined;

    if (!minPosition || !maxPosition) {
        console.log("Misconfigured!");
        return { minPosition: 1, maxPosition: 100, feedToMonitor: "all" };
    }

    if (minPosition > maxPosition) {
        console.log("Misconfigured!");
        return { minPosition: 1, maxPosition: 100, feedToMonitor: "all" };
    }

    const feedToMonitor = settings[AppSetting.FeedToMonitor] as string | undefined;
    if (!feedToMonitor) {
        console.log("No feed!");
        return { minPosition: 1, maxPosition: 100, feedToMonitor: "all" };
    }

    const verboseLogging = settings[AppSetting.VerboseLogging] as boolean | undefined ?? false;

    return { minPosition, maxPosition, feedToMonitor, verboseLogging };
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
    await context.redis.set(redisKey, JSON.stringify(subNSFW), { expiration: addWeeks(new Date(), 1) });
    return subNSFW;
}

export async function getPostsFromAll (_: unknown, context: JobContext) {
    const { minPosition, maxPosition, feedToMonitor, verboseLogging } = await getSettings(context);

    const postsInAllResult = await context.reddit.getHotPosts({
        subredditName: feedToMonitor,
        limit: maxPosition,
    }).all();

    const postsInAll: OrderedPost[] = [];

    let index = 1;

    for (const post of postsInAllResult) {
        if (!post.nsfw && index >= minPosition) {
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
    }

    const postsToAddToQueue = postsInAll.filter(post => !existingRecords.some(item => item.member === post.post.id));
    if (postsToAddToQueue.length > 0) {
        await context.redis.zAdd(POST_QUEUE_KEY, ...postsToAddToQueue.map(post => ({ member: post.post.id, score: new Date().getTime() })));
    }

    await context.redis.zAdd(POSTS_IN_ALL_KEY, ...postsInAll.map(item => ({ member: item.post.id, score: item.index })));

    if (verboseLogging) {
        console.log(`Populate: ${existingRecordsToRemove.length} queued, ${postsToAddToQueue.length} dequeued, ${postsInAll.length} recorded`);
    }
}

export async function checkPosts (_: unknown, context: JobContext) {
    const { minPosition, maxPosition, verboseLogging } = await getSettings(context);
    let itemsToCheck = Math.round((maxPosition - minPosition) / 18);
    if (itemsToCheck < 10) {
        itemsToCheck = 10;
    }

    const postsToCheck = await context.redis.zRange(POST_QUEUE_KEY, 0, itemsToCheck - 1, { by: "rank" });
    if (postsToCheck.length === 0) {
        console.log("Check: No posts to check yet.");
        return;
    }

    const itemsToRequeue: ZMember[] = [];
    for (const item of postsToCheck) {
        const post = await context.reddit.getPostById(item.member);
        if (post.removedByCategory !== "moderator") {
            itemsToRequeue.push({ member: post.id, score: addMinutes(new Date(), 5).getTime() });
            continue;
        }

        const score = await context.redis.zScore(POSTS_IN_ALL_KEY, item.member);
        if (score) {
            await createPost(post, score, context);
        }

        await context.redis.zRem(POST_QUEUE_KEY, [item.member]);
    }

    if (itemsToRequeue.length > 0) {
        await context.redis.zAdd(POST_QUEUE_KEY, ...itemsToRequeue);
        if (verboseLogging) {
            console.log(`Check: Queued ${itemsToRequeue.length} ${pluralize("post", itemsToRequeue.length)} out of ${postsToCheck.length} for future checking.`);
        }
    }
}

export interface PostTitleInfo {
    index: number;
    upvotes: number;
    commentCount: number;
    postTitle: string;
    subredditName: string;
}

export function getNewPostTitle (data: PostTitleInfo): string {
    const prefix = `[#${data.index}|+${data.upvotes}|${data.commentCount}] `;
    const suffix = ` [r/${data.subredditName}]`;

    let newPostTitle: string;
    const totalLength = prefix.length + suffix.length + data.postTitle.length;

    if (totalLength <= 300) {
        newPostTitle = prefix + data.postTitle + suffix;
    } else {
        newPostTitle = prefix + data.postTitle.slice(0, data.postTitle.length - (totalLength - 297)) + "..." + suffix;
    }

    return newPostTitle;
}

async function createPost (post: Post, index: number, context: TriggerContext) {
    const isNSFW = await isSubredditNSFW(post.subredditName, context);
    if (isNSFW) {
        console.log(`Create: Post for ${post.id} not made because ${post.subredditName} is NSFW`);
        return;
    }

    const redisKey = `postMade:${post.id}`;
    const alreadyDone = await context.redis.get(redisKey);
    if (alreadyDone) {
        return;
    }

    const subredditName = context.subredditName ?? (await context.reddit.getCurrentSubreddit()).name;

    const newPostTitle = getNewPostTitle({
        index,
        upvotes: post.score,
        commentCount: post.numberOfComments,
        postTitle: post.title,
        subredditName: post.subredditName,
    });

    const newPost = await context.reddit.submitPost({
        subredditName,
        url: `https://www.reddit.com${post.permalink}`,
        title: newPostTitle,
    });

    await setCleanupForPost(newPost.id, post.id, context, addDays(new Date(), 1));

    console.log(`Create: New post for ${post.id}: https://www.reddit.com${newPost.permalink}`);

    await context.redis.set(redisKey, new Date().getTime().toString(), { expiration: addWeeks(new Date(), 2) });
}
