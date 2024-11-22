import { Devvit } from "@devvit/public-api";
import { appSettings } from "./settings.js";
import { handleInstallEvent, handleUpgradeEvents } from "./installEvents.js";
import { CHECK_POSTS_JOB, GET_ALL_JOB, SUB_NSFW_CHECK } from "./constants.js";
import { checkPosts, getPostsFromAll, subNSFWCheck } from "./frontPageWatch.js";

Devvit.addSettings(appSettings);

Devvit.addTrigger({
    event: "AppInstall",
    onEvent: handleInstallEvent,
});

Devvit.addTrigger({
    event: "AppUpgrade",
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
    name: SUB_NSFW_CHECK,
    onRun: subNSFWCheck,
});

Devvit.configure({
    redditAPI: true,
    redis: true,
});

export default Devvit;
