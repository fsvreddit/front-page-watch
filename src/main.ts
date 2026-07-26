import { Devvit } from "@devvit/public-api";
import { appSettings } from "./settings.js";
import { handleUpgradeEvents } from "./installEvents.js";
import { SchedulerJob } from "./constants.js";
import { checkPosts, getPostsFromAll } from "./frontPageWatch.js";
import { handleCleanupJob } from "./cleanup.js";

Devvit.addSettings(appSettings);

Devvit.addTrigger({
    events: ["AppInstall", "AppUpgrade"],
    onEvent: handleUpgradeEvents,
});

Devvit.addSchedulerJob({
    name: SchedulerJob.GetAll,
    onRun: getPostsFromAll,
});

Devvit.addSchedulerJob({
    name: SchedulerJob.CheckPosts,
    onRun: checkPosts,
});

Devvit.addSchedulerJob({
    name: SchedulerJob.Cleanup,
    onRun: handleCleanupJob,
});

Devvit.configure({
    redditAPI: true,
});

export default Devvit;
