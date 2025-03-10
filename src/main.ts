import { Devvit } from "@devvit/public-api";
import { appSettings } from "./settings.js";
import { handleUpgradeEvents } from "./installEvents.js";
import { CHECK_POSTS_JOB, CLEANUP_JOB, GET_ALL_JOB } from "./constants.js";
import { checkPosts, getPostsFromAll } from "./frontPageWatch.js";
import { handleCleanupJob } from "./cleanup.js";

Devvit.addSettings(appSettings);

Devvit.addTrigger({
    events: ["AppInstall", "AppUpgrade"],
    onEvent: handleUpgradeEvents,
});

Devvit.addSchedulerJob({
    name: GET_ALL_JOB,
    onRun: getPostsFromAll,
});

Devvit.addSchedulerJob({
    name: CHECK_POSTS_JOB,
    onRun: checkPosts,
});

Devvit.addSchedulerJob({
    name: CLEANUP_JOB,
    onRun: handleCleanupJob,
});

Devvit.configure({
    redditAPI: true,
});

export default Devvit;
