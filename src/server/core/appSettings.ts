import { settings } from "@devvit/web/server";

export enum AppSetting {
    FeedToMonitor = "feedToMonitor",
    MinPosition = "minPosition",
    MaxPosition = "maxPosition",
    VerboseLogging = "verboseLogging",
}

export async function getSettings () {
    const appSettings = await settings.getAll();

    const minPosition = appSettings[AppSetting.MinPosition] as number | undefined;
    const maxPosition = appSettings[AppSetting.MaxPosition] as number | undefined;

    if (!minPosition || !maxPosition) {
        console.log("Misconfigured!");
        return { minPosition: 1, maxPosition: 100, feedToMonitor: "all" };
    }

    if (minPosition > maxPosition) {
        console.log("Misconfigured!");
        return { minPosition: 1, maxPosition: 100, feedToMonitor: "all" };
    }

    const feedToMonitor = appSettings[AppSetting.FeedToMonitor] as string | undefined ?? "";

    const verboseLogging = appSettings[AppSetting.VerboseLogging] as boolean | undefined ?? false;

    return { minPosition, maxPosition, feedToMonitor, verboseLogging };
}
