import { context, Post, reddit, redis, SubredditInfo, TaskRequest, ZMember } from "@devvit/web/server";
import { T3 } from "@devvit/web/shared";
import { getSettings, setCleanupForPost } from ".";
import pluralize from "pluralize";
import { addDays, addMinutes, addWeeks } from "date-fns";
import { fromPairs } from "lodash";
import { hasTriggerBeenHandled } from "@fsvreddit/fsv-devvit-web-helpers";
import { GetPostsFromAllJobData } from "../tasks";

const POSTS_IN_ALL_KEY = "postsInAll";
const POST_QUEUE_KEY = "postQueueKey";
const POST_TITLES_KEY = "postTitlesKey";

interface OrderedPost {
    post: Post;
    index: number;
}

async function isSubredditNSFW (subredditName: string) {
    const redisKey = `subIsNSFW:${subredditName}`;
    const isNSFW = await redis.get(redisKey);
    if (isNSFW) {
        return JSON.parse(isNSFW) as boolean;
    }

    let subredditInfo: SubredditInfo | undefined;
    try {
        subredditInfo = await reddit.getSubredditInfoByName(subredditName);
        const subNSFW = subredditInfo.isNsfw ?? true;
        await redis.set(redisKey, JSON.stringify(subNSFW), { expiration: addWeeks(new Date(), 1) });
        return subNSFW;
    } catch {
        console.log(`Error retrieving subreddit info for ${subredditName}, assuming NSFW by default`);
        return true; // Default to true if we can't get the subreddit info
    }
}

export async function getPostsFromAll (event: TaskRequest<GetPostsFromAllJobData | undefined>) {
    const jobGuid = event.data?.jobGuid;
    if (jobGuid && await hasTriggerBeenHandled(`job:${jobGuid}`, { expiration: addMinutes(new Date(), 5) })) {
        console.warn(`Populate: Job ${jobGuid} has already been handled, skipping`);
        return;
    }

    const { minPosition, maxPosition, feedToMonitor, verboseLogging } = await getSettings();

    if (!feedToMonitor) {
        console.warn("Populate: No feed to monitor set, skipping");
        return;
    }

    const postsInAllResult = await reddit.getHotPosts({
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

    const existingRecords = await redis.zRange(POSTS_IN_ALL_KEY, 0, -1);

    const existingRecordsToRemove = existingRecords
        .filter(item => !postsInAll.some(post => post.post.id === item.member))
        .map(item => item.member);

    if (existingRecordsToRemove.length > 0) {
        await redis.hDel(POST_TITLES_KEY, existingRecordsToRemove);
        await redis.zRem(POSTS_IN_ALL_KEY, existingRecordsToRemove);
        await redis.zRem(POST_QUEUE_KEY, existingRecordsToRemove);
    }

    const postsToAddToQueue = postsInAll.filter(post => !existingRecords.some(item => item.member === post.post.id));
    if (postsToAddToQueue.length > 0) {
        await redis.zAdd(POST_QUEUE_KEY, ...postsToAddToQueue.map(post => ({ member: post.post.id, score: new Date().getTime() })));
    }

    await redis.zAdd(POSTS_IN_ALL_KEY, ...postsInAll.map(item => ({ member: item.post.id, score: item.index })));

    const postTitles = postsInAll
        .filter(item => !item.post.title.includes("Removed by moderator"))
        .map(item => ([item.post.id, item.post.title]));

    await redis.hSet(POST_TITLES_KEY, fromPairs(postTitles));

    if (verboseLogging) {
        console.log(`Populate: ${existingRecordsToRemove.length} queued, ${postsToAddToQueue.length} dequeued, ${postsInAll.length} recorded`);
    }
}

export async function checkPosts () {
    const { minPosition, maxPosition, verboseLogging } = await getSettings();
    let itemsToCheck = Math.round((maxPosition - minPosition) / 18);
    if (itemsToCheck < 10) {
        itemsToCheck = 10;
    }

    const postsToCheck = await redis.zRange(POST_QUEUE_KEY, 0, itemsToCheck - 1, { by: "rank" });
    if (postsToCheck.length === 0) {
        console.log("Check: No posts to check yet.");
        return;
    }

    const itemsToRequeue: ZMember[] = [];
    for (const item of postsToCheck) {
        let post: Post | undefined;
        try {
            post = await reddit.getPostById(item.member as T3);
        } catch (error) {
            if (verboseLogging) {
                console.log(`Error retrieving post ${item.member}`);
                console.log(error);
            }
            await redis.zRem(POST_QUEUE_KEY, [item.member]);
            continue;
        }

        if (post.removedByCategory !== "moderator") {
            itemsToRequeue.push({ member: post.id, score: addMinutes(new Date(), 5).getTime() });
            continue;
        }

        const score = await redis.zScore(POSTS_IN_ALL_KEY, item.member);
        if (score) {
            await createPost(post, score);
        }

        await redis.zRem(POST_QUEUE_KEY, [item.member]);
    }

    if (itemsToRequeue.length > 0) {
        await redis.zAdd(POST_QUEUE_KEY, ...itemsToRequeue);
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

async function createPost (post: Post, index: number) {
    const isNSFW = await isSubredditNSFW(post.subredditName);
    if (isNSFW) {
        console.log(`Create: Post for ${post.id} not made because ${post.subredditName} is NSFW`);
        return;
    }

    const redisKey = `postMade:${post.id}`;
    const alreadyDone = await redis.get(redisKey);
    if (alreadyDone) {
        return;
    }

    const postTitle = await redis.hGet(POST_TITLES_KEY, post.id);
    if (postTitle) {
        console.log(`Create: Using cached title for ${post.id}, current title is "${post.title}"`);
    }

    const subredditName = context.subredditName;

    const newPostTitle = getNewPostTitle({
        index,
        upvotes: post.score,
        commentCount: post.numberOfComments,
        postTitle: postTitle ?? post.title,
        subredditName: post.subredditName,
    });

    const newPost = await reddit.submitPost({
        subredditName,
        url: `https://www.reddit.com${post.permalink}`,
        title: newPostTitle,
    });

    await setCleanupForPost(newPost.id, post.id, addDays(new Date(), 1));

    console.log(`Create: New post for ${post.id}: https://redd.it/${newPost.id.slice(3)}`);

    await redis.set(redisKey, new Date().getTime().toString(), { expiration: addWeeks(new Date(), 2) });
}
