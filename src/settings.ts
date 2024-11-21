import { SettingsFormField, SettingsFormFieldValidatorEvent } from "@devvit/public-api";

export enum AppSetting {
    MinPosition = "minPosition",
    MaxPosition = "maxPosition",
}

function validatePosition ({ value }: SettingsFormFieldValidatorEvent<number>) {
    if (!value || value < 1 || value > 1000 || value !== Math.round(value)) {
        return "You must enter a whole number between 1 and 1000";
    }
}

export const appSettings: SettingsFormField[] = [
    {
        type: "number",
        name: AppSetting.MinPosition,
        label: "Start position on /r/all to monitor. Must be lower than end position",
        defaultValue: 1,
        onValidate: validatePosition,
    },
    {
        type: "number",
        name: AppSetting.MaxPosition,
        label: "End position on /r/all to monitor. Must be higher than start position",
        defaultValue: 100,
        onValidate: validatePosition,
    },
];
