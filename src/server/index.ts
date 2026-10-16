import { Hono } from "hono";
import { createServer, getServerPort } from "@devvit/web/server";
import { getRequestListener } from "@hono/node-server";
import { onAppInstall, onAppUpgrade } from "./triggers";
import { handleValidateFeedAndRequeue, handleValidatePosition } from "./validators";
import { handleGetPostsFromAllJob, handleCheckPostsJob, handleCleanupJob } from "./tasks";

const application = new Hono();

// Triggers
application.post("/internal/triggers/app-install", onAppInstall);
application.post("/internal/triggers/app-upgrade", onAppUpgrade);

// Settings validators
application.post("/internal/validators/validate-feed", handleValidateFeedAndRequeue);
application.post("/internal/validators/validate-position", handleValidatePosition);

// Scheduler jobs
application.post("/internal/tasks/get-all", handleGetPostsFromAllJob);
application.post("/internal/tasks/check-posts", handleCheckPostsJob);
application.post("/internal/tasks/cleanup", handleCleanupJob);

const server = createServer(getRequestListener(application.fetch));
server.on("error", (err) => {
    console.error(`server error; ${err.stack}`);
});

const port = getServerPort();
server.listen(port);
