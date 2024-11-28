import { SettingsFormField, SettingsFormFieldValidatorEvent, TriggerContext } from "@devvit/public-api";
import { GET_ALL_JOB } from "./constants.js";

export enum AppSetting {
    FeedToMonitor = "feedToMonitor",
    MinPosition = "minPosition",
    MaxPosition = "maxPosition",
    VerboseLogging = "verboseLogging",
}

async function validateFieldAndRequeue (event: SettingsFormFieldValidatorEvent<string>, context: TriggerContext) {
    if (!event.value) {
        return "You must enter a feed to monitor";
    }

    try {
        await context.reddit.getHotPosts({
            subredditName: event.value,
            limit: 100,
        }).all();
    } catch {
        return `Cannot retrieve posts from r/${event.value}`;
    }

    await context.scheduler.runJob({
        name: GET_ALL_JOB,
        runAt: new Date(),
    });
}

function validatePosition ({ value }: SettingsFormFieldValidatorEvent<number>) {
    if (!value || value < 1 || value > 1000 || value !== Math.round(value)) {
        return "You must enter a whole number between 1 and 1000";
    }
}

export const appSettings: SettingsFormField[] = [
    {
        type: "string",
        name: AppSetting.FeedToMonitor,
        label: "Feed to monitor",
        defaultValue: "all",
        onValidate: validateFieldAndRequeue,
    },
    {
        type: "number",
        name: AppSetting.MinPosition,
        label: "Start position on feed to monitor. Must be lower than end position",
        defaultValue: 1,
        onValidate: validatePosition,
    },
    {
        type: "number",
        name: AppSetting.MaxPosition,
        label: "End position on feed to monitor. Must be higher than start position",
        defaultValue: 100,
        onValidate: validatePosition,
    },
    {
        type: "boolean",
        name: AppSetting.VerboseLogging,
        label: "Verbose logging",
        defaultValue: false,
    },
];
