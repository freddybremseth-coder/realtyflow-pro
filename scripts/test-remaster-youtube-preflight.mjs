import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("src/app/api/neural-beat/mixes/production/route.ts", "utf8");
const worker = fs.readFileSync("src/services/pipelines/remaster-mix-worker.ts", "utf8");
const youtube = fs.readFileSync("src/services/integrations/remaster-youtube-longform.ts", "utf8");

const routePreflight = route.indexOf("await verifyRemasterLongFormYouTubeConnection();");
const routeQueue = route.indexOf("const now = new Date().toISOString();");
assert.ok(routePreflight >= 0, "Production route must verify Re-Master YouTube before queueing");
assert.ok(routeQueue > routePreflight, "YouTube preflight must happen before the production job is queued");
assert.ok(route.includes('code: "YOUTUBE_RECONNECT_REQUIRED"'), "Production route must return a stable reconnect-required code");
assert.ok(route.includes("reconnectUrl: REMASTER_YOUTUBE_RECONNECT_URL"), "Production route must return an OAuth reconnect URL");

const executeStart = worker.indexOf("export async function executeClaimedRemasterMixJob");
const executeSource = worker.slice(executeStart);
const workerPreflight = executeSource.indexOf("await verifyRemasterLongFormYouTubeConnection();");
const audioBuild = executeSource.indexOf("audio = await buildRemasterMixAudio(");
assert.ok(workerPreflight >= 0, "Worker must verify Re-Master YouTube");
assert.ok(audioBuild > workerPreflight, "Worker YouTube preflight must happen before expensive audio/video work");

const uploadCall = executeSource.indexOf("const upload = await uploadRemasterLongFormFile({");
const readyHook = executeSource.indexOf("onReadyToInsert: async () =>", uploadCall);
const uploadMarker = executeSource.indexOf("await markUploadStarting(job);", readyHook);
assert.ok(uploadCall >= 0 && readyHook > uploadCall, "Worker must arm duplicate protection through the upload readiness hook");
assert.ok(uploadMarker > readyHook, "YouTube upload marker must be set inside onReadyToInsert");
assert.ok(executeSource.includes("!uploadStarted && !reconnectRequired"), "Reconnect-required failures must not auto-rerender");

const verifyClient = youtube.indexOf("const { client, channelId, channelTitle } = await getVerifiedLongFormClient();");
const readyInsert = youtube.indexOf("if (input.onReadyToInsert) await input.onReadyToInsert();");
const videosInsert = youtube.indexOf("const upload = await client.videos.insert({");
assert.ok(verifyClient >= 0, "Uploader must verify the exact Re-Master channel");
assert.ok(readyInsert > verifyClient, "Upload readiness hook must run after channel verification");
assert.ok(videosInsert > readyInsert, "Upload readiness hook must run immediately before videos.insert");

console.log("Re-Master YouTube preflight ordering contract passed");
