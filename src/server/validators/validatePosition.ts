import { SettingsValidationRequest, SettingsValidationResponse } from "@devvit/web/shared";
import type { Context } from "hono";

export const handleValidatePosition = async (c: Context): Promise<Response> => {
    const validationRequest = await c.req.json<SettingsValidationRequest<number>>();

    const { value } = validationRequest;

    if (!value || value < 1 || value > 1000 || value !== Math.round(value)) {
        return c.json<SettingsValidationResponse>({
            success: false,
            error: "You must enter a whole number between 1 and 1000",
        });
    }

    return c.json<SettingsValidationResponse>({ success: true }, 200);
};
