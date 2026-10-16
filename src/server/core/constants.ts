export enum SchedulerJob {
    GetAll = "getAllJob",
    CheckPosts = "checkPostsJob",
    Cleanup = "cleanupJob",
}

export enum SchedulerCron {
    GetAll = "*/20 * * * *",
    CheckPosts = "* * * * *",
    Cleanup = "0 4 * * *",
}
