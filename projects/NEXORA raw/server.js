// NEXORA V7.4.0 — personal media server
// Based on the saved V6 server. Keeps its scanner, safe media resolution,
// symlink checks, byte-range streaming and download routes. The thumbnail
// endpoint now samples several points through a video and caches a selected
// representative frame instead of always taking the opening frame.

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const app = express();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const MEDIA_ROOT = path.resolve(ROOT, "Entertainment");
const PUBLIC_ROOT = ROOT;
const THUMB_ROOT = path.join(PUBLIC_ROOT, "assets", "thumbnails");
const PREVIEW_ROOT = path.join(PUBLIC_ROOT, "assets", "previews");

const VIDEO = new Set([
  "mp4", "m4v", "webm", "ogg", "mov", "mkv", "avi", "mpeg", "mpg", "3gp"
]);
const AUDIO = new Set([
  "mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "weba", "aiff", "wma"
]);
const MIME = {
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", ogg: "video/ogg",
  mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo",
  mpeg: "video/mpeg", mpg: "video/mpeg", "3gp": "video/3gpp",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
  flac: "audio/flac", opus: "audio/ogg", weba: "audio/webm", aiff: "audio/aiff",
  wma: "audio/x-ms-wma"
};

if (!fs.existsSync(MEDIA_ROOT)) {
  console.error("[NEXORA] Entertainment directory not found:", MEDIA_ROOT);
  console.error("Create an Entertainment folder beside server.js and place your media folders inside it.");
  process.exit(1);
}

fs.mkdirSync(THUMB_ROOT, { recursive: true });
fs.mkdirSync(PREVIEW_ROOT, { recursive: true });
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use("/assets", express.static(path.join(PUBLIC_ROOT, "assets"), {
  maxAge: "1d",
  fallthrough: true
}));

// Always fetch the latest frontend after updating project files.
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(ROOT, "index.html"));
});
app.get("/style.css", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(ROOT, "style.css"));
});
app.get("/script.js", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(ROOT, "script.js"));
});

/* -------------------- Library scanner -------------------- */

async function scanDirectory(directory, relative = "") {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = [];
  const folders = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const absolute = path.join(directory, entry.name);
    const rel = relative ? `${relative}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      folders.push(rel);
      const nested = await scanDirectory(absolute, rel);
      files.push(...nested.files);
      folders.push(...nested.folders);
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).slice(1).toLowerCase();
    const type = VIDEO.has(extension) ? "video" : AUDIO.has(extension) ? "audio" : null;
    if (!type) continue;

    const stats = await fs.promises.stat(absolute);
    const folderParts = relative ? relative.split("/") : [];

    files.push({
      id: rel,
      name: path.basename(entry.name, path.extname(entry.name)),
      fileName: entry.name,
      path: rel,
      folders: folderParts,
      category: folderParts[0] || "Uncategorized",
      genre: folderParts[1] || "",
      type,
      extension,
      size: stats.size,
      modified: stats.mtimeMs
    });
  }

  return { files, folders };
}

app.get("/api/health", (req, res) => {
  res.json({ success: true, server: "NEXORA", version: "7.4.0", status: "online" });
});

app.get("/api/library", async (req, res) => {
  try {
    const result = await scanDirectory(MEDIA_ROOT);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      version: "7.4.0",
      total: result.files.length,
      folderCount: result.folders.length,
      folders: result.folders,
      files: result.files
    });
  } catch (error) {
    console.error("[NEXORA] Scanner error:", error);
    res.status(500).json({ success: false, message: "Unable to scan media directory." });
  }
});

/* -------------------- Safe path resolution -------------------- */

function resolveMedia(requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath || requestedPath.includes("\0")) return null;
  const normalized = requestedPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return null;

  const filePath = path.resolve(MEDIA_ROOT, ...parts);
  const relative = path.relative(MEDIA_ROOT, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

async function verifyMedia(filePath) {
  const relative = path.relative(MEDIA_ROOT, filePath);
  let current = MEDIA_ROOT;

  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const info = await fs.promises.lstat(current);
    if (info.isSymbolicLink()) throw new Error("Symbolic links are not allowed.");
  }

  const stats = await fs.promises.stat(filePath);
  if (!stats.isFile()) throw new Error("Not a media file.");

  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!VIDEO.has(extension) && !AUDIO.has(extension)) throw new Error("Unsupported media format.");
  return { stats, extension };
}

/* -------------------- Fast representative thumbnails + previews --------------------

   V7.4 fixes the biggest latency problem in V7.3.1:
   the prior thumbnail route spawned up to FIVE FFmpeg processes in series
   for every new video. The new path probes duration once, stores one stable
   scene timestamp, then uses ONE FFmpeg extraction per requested thumbnail
   size. Both the thumbnail and short preview use the same saved timestamp.

----------------------------------------------------------------------------- */

const thumbnailJobs = new Map();
const metadataJobs = new Map();
const previewJobs = new Map();

const THUMBNAIL_ALGORITHM = "nexora-poster-single-scene-v5";
const PREVIEW_ALGORITHM = "nexora-muted-preview-h264-v3";

const MAX_FFMPEG_JOBS = Math.max(
  1,
  Math.min(3, Number(process.env.NEXORA_FFMPEG_JOBS) || 2)
);

let activeFfmpegJobs = 0;
const ffmpegWaiters = [];

async function withFfmpegSlot(task) {
  if (activeFfmpegJobs >= MAX_FFMPEG_JOBS) {
    // A released slot is transferred directly to the next waiter. Keeping
    // the active count unchanged during transfer prevents a thundering-herd
    // race from temporarily exceeding the configured process limit.
    await new Promise(resolve => ffmpegWaiters.push(resolve));
  } else {
    activeFfmpegJobs++;
  }

  try {
    return await task();
  } finally {
    const next = ffmpegWaiters.shift();
    if (next) {
      next();
    } else {
      activeFfmpegJobs--;
    }
  }
}

function runTool(command, args, options = {}) {
  return execFileAsync(command, args, {
    timeout: options.timeout || 30000,
    maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
    windowsHide: true
  });
}

async function getDuration(filePath) {
  const { stdout } = await runTool("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ], { timeout: 20000 });

  const duration = Number(String(stdout || "").trim());

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("FFprobe could not read a valid video duration.");
  }

  return duration;
}

function hashKey(value) {
  return crypto.createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function timeString(value) {
  return Math.max(0, Number(value) || 0).toFixed(3);
}

function sceneMetadataPath(filePath, stats) {
  const key = hashKey(
    `${THUMBNAIL_ALGORITHM}:${filePath}:${stats.size}:${stats.mtimeMs}`
  );
  return path.join(THUMB_ROOT, `${key}.scene.json`);
}

async function getSceneMetadata(filePath, stats) {
  const metaPath = sceneMetadataPath(filePath, stats);

  try {
    const raw = await fs.promises.readFile(metaPath, "utf8");
    const saved = JSON.parse(raw);

    if (
      Number.isFinite(saved.duration) &&
      saved.duration > 0 &&
      Number.isFinite(saved.timestamp) &&
      saved.timestamp >= 0 &&
      saved.timestamp < saved.duration
    ) {
      return saved;
    }
  } catch {
    // Metadata will be recreated below.
  }

  if (!metadataJobs.has(metaPath)) {
    const job = withFfmpegSlot(async () => {
      const duration = await getDuration(filePath);

      // Choose a deterministic point in the middle portion of the title.
      // A per-file hash varies the sample between 34% and 58%, avoiding the
      // opening logos/credits without choosing a random timestamp each load.
      const digest = crypto.createHash("sha1")
        .update(filePath)
        .digest();

      const ratio = 0.34 + (digest[0] / 255) * 0.24;
      const safety = Math.min(1.75, Math.max(0.15, duration * 0.08));
      const timestamp = duration <= 1.5
        ? 0
        : Math.max(0, Math.min(duration * ratio, duration - safety));

      const metadata = {
        duration,
        timestamp,
        algorithm: THUMBNAIL_ALGORITHM
      };

      const temp = `${metaPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

      await fs.promises.writeFile(
        temp,
        JSON.stringify(metadata),
        "utf8"
      );

      await fs.promises.rename(temp, metaPath);

      return metadata;
    }).finally(() => metadataJobs.delete(metaPath));

    metadataJobs.set(metaPath, job);
  }

  return metadataJobs.get(metaPath);
}

function thumbnailWidthBucket(requested) {
  const width = Math.max(240, Math.min(1280, Number(requested) || 640));
  if (width <= 360) return 320;
  if (width <= 700) return 640;
  return 960;
}

function thumbnailCachePath(filePath, stats, width) {
  const key = hashKey(
    `${THUMBNAIL_ALGORITHM}:${filePath}:${stats.size}:${stats.mtimeMs}:w${width}`
  );
  return path.join(THUMB_ROOT, `${key}.jpg`);
}

async function createThumbnail(filePath, output, metadata, width) {
  const duration = metadata.duration;
  const start = metadata.timestamp;
  const sampleLength = Math.max(
    0.45,
    Math.min(2.4, Math.max(0.45, duration - start))
  );

  const temp = `${output}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}.jpg`;

  try {
    // One short sample window. FFmpeg picks a representative frame from it.
    await runTool("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", timeString(start),
      "-i", filePath,
      "-t", timeString(sampleLength),
      "-map", "0:v:0",
      "-an", "-sn", "-dn",
      "-vf", `thumbnail=24,scale=${width}:-2:force_original_aspect_ratio=decrease,setsar=1,eq=contrast=1.06:saturation=1.12`,
      "-frames:v", "1",
      "-q:v", "3",
      "-y", temp
    ], { timeout: 50000, maxBuffer: 3 * 1024 * 1024 });

    let info = await fs.promises.stat(temp);

    if (!info.isFile() || info.size < 1200) {
      throw new Error("FFmpeg returned an empty poster frame.");
    }

  } catch (primaryError) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});

    // Fallback: single frame at the same later scene timestamp, without the
    // representative-batch filter. This supports unusual frame rates/short clips.
    await runTool("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", timeString(start),
      "-i", filePath,
      "-map", "0:v:0",
      "-an", "-sn", "-dn",
      "-vf", `scale=${width}:-2:force_original_aspect_ratio=decrease,setsar=1,eq=contrast=1.06:saturation=1.12`,
      "-frames:v", "1",
      "-q:v", "3",
      "-y", temp
    ], { timeout: 35000, maxBuffer: 3 * 1024 * 1024 });

    const info = await fs.promises.stat(temp);

    if (!info.isFile() || info.size < 1200) {
      throw new Error(`Poster extraction failed: ${primaryError.message}`);
    }
  }

  await fs.promises.rename(temp, output);
}

async function ensureThumbnail(filePath, stats, requestedWidth) {
  const metadata = await getSceneMetadata(filePath, stats);
  const width = thumbnailWidthBucket(requestedWidth);
  const output = thumbnailCachePath(filePath, stats, width);

  try {
    const cached = await fs.promises.stat(output);
    if (cached.isFile() && cached.size >= 1200) {
      return { output, metadata, width, cached: true };
    }
  } catch {
    // Generate below.
  }

  if (!thumbnailJobs.has(output)) {
    const job = withFfmpegSlot(() =>
      createThumbnail(filePath, output, metadata, width)
    ).finally(() => thumbnailJobs.delete(output));

    thumbnailJobs.set(output, job);
  }

  await thumbnailJobs.get(output);

  return { output, metadata, width, cached: false };
}

function sendGeneratedFile(res, filePath, contentType, cacheSeconds = 604800) {
  res.setHeader("Cache-Control", `public, max-age=${cacheSeconds}, immutable`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(contentType);

  res.sendFile(filePath, error => {
    if (error && !res.headersSent) {
      res.status(error.statusCode || 500).end();
    }
  });
}

app.get("/api/thumbnail", async (req, res) => {
  try {
    const filePath = resolveMedia(req.query.path);
    if (!filePath) return res.status(400).json({ error: "Invalid media path." });

    const { stats, extension } = await verifyMedia(filePath);
    if (!VIDEO.has(extension)) {
      return res.status(415).json({ error: "Posters are available for video files only." });
    }

    const result = await ensureThumbnail(filePath, stats, req.query.w);
    return sendGeneratedFile(res, result.output, "image/jpeg");

  } catch (error) {
    console.error("[NEXORA] Thumbnail error:", error.stack || error.message);
    if (!res.headersSent) {
      res.status(503).json({
        error: "Thumbnail generation failed.",
        detail: error.message,
        hint: "Check ffmpeg, ffprobe, file permissions and the source video."
      });
    }
  }
});

/* -------------------- Short muted preview clips -------------------- */

async function createPreviewClip(filePath, output, start, duration) {
  const temp = `${output}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}.mp4`;

  try {
    await runTool("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", timeString(start),
      "-i", filePath,
      "-t", timeString(duration),
      "-map", "0:v:0",
      "-an", "-sn", "-dn",
      "-vf", "scale=640:-2:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=20,setsar=1,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "30",
      "-profile:v", "baseline",
      "-level:v", "3.0",
      "-g", "40",
      "-keyint_min", "40",
      "-sc_threshold", "0",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-threads", "2",
      "-y", temp
    ], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });

    const result = await fs.promises.stat(temp);
    if (!result.isFile() || result.size < 4000) {
      throw new Error("FFmpeg produced an invalid preview clip.");
    }

    await fs.promises.rename(temp, output);

  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

app.get("/api/preview", async (req, res) => {
  try {
    const filePath = resolveMedia(req.query.path);
    if (!filePath) return res.status(400).json({ error: "Invalid media path." });

    const { stats, extension } = await verifyMedia(filePath);
    if (!VIDEO.has(extension)) {
      return res.status(415).json({ error: "Previews are available for video files only." });
    }

    const metadata = await getSceneMetadata(filePath, stats);
    const duration = metadata.duration;

    if (!Number.isFinite(duration) || duration < 1.5) {
      return res.status(422).json({ error: "This video is too short to preview." });
    }

    const requested = Number(req.query.duration);
    const wanted = Number.isFinite(requested)
      ? Math.max(4, Math.min(12, requested))
      : 8;

    const clipLength = Math.min(wanted, duration);

    // Centre the clip around the poster's selected scene when possible.
    // This keeps the title card and moving preview visually related.
    const timestamp = metadata.timestamp;
    const start = Math.max(
      0,
      Math.min(timestamp - Math.min(0.65, clipLength * 0.12), duration - clipLength)
    );

    const cacheKey = hashKey(
      `${PREVIEW_ALGORITHM}:${filePath}:${stats.size}:${stats.mtimeMs}:${start.toFixed(3)}:${clipLength.toFixed(3)}`
    );

    const output = path.join(PREVIEW_ROOT, `${cacheKey}.mp4`);

    try {
      const cached = await fs.promises.stat(output);
      if (!cached.isFile() || cached.size < 4000) {
        throw new Error("Preview cache entry is invalid.");
      }
    } catch {
      if (!previewJobs.has(output)) {
        const job = withFfmpegSlot(() =>
          createPreviewClip(filePath, output, start, clipLength)
        ).finally(() => previewJobs.delete(output));

        previewJobs.set(output, job);
      }

      await previewJobs.get(output);
    }

    // Express sendFile/send supports HTTP Range responses. This is important
    // for browsers that probe or seek in the generated MP4 clip.
    res.setHeader("Accept-Ranges", "bytes");
    return sendGeneratedFile(res, output, "video/mp4", 31536000);

  } catch (error) {
    console.error("[NEXORA] Preview error:", error.stack || error.message);

    if (!res.headersSent) {
      res.status(503).json({
        error: "Preview generation failed.",
        detail: error.message,
        hint: "Run ffmpeg -version, ffprobe -version and check that FFmpeg supports libx264."
      });
    }
  }
});

/* -------------------- Runtime diagnostics -------------------- */

async function toolCheck(command, args) {
  try {
    const result = await runTool(command, args, { timeout: 12000, maxBuffer: 1024 * 1024 });
    return { available: true, output: String(result.stdout || result.stderr || "").trim().split("\n")[0] };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

app.get("/api/diagnostics", async (req, res) => {
  try {
    const [ffmpeg, ffprobe, encoders, thumbWritable, previewWritable] = await Promise.all([
      toolCheck("ffmpeg", ["-version"]),
      toolCheck("ffprobe", ["-version"]),
      toolCheck("ffmpeg", ["-hide_banner", "-encoders"]),
      fs.promises.access(THUMB_ROOT, fs.constants.W_OK).then(() => true).catch(() => false),
      fs.promises.access(PREVIEW_ROOT, fs.constants.W_OK).then(() => true).catch(() => false)
    ]);

    const encoderOutput = encoders.available ? String(encoders.output || "") : "";

    // The first line of `-encoders` is a heading; query text is not echoed in
    // toolCheck's first-line summary, so make a compact full check separately.
    let libx264 = false;
    if (encoders.available) {
      try {
        const full = await runTool("ffmpeg", ["-hide_banner", "-encoders"], { timeout: 12000, maxBuffer: 2 * 1024 * 1024 });
        libx264 = /\blibx264\b/.test(String(full.stdout || ""));
      } catch {
        libx264 = false;
      }
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      server: "NEXORA",
      version: "7.4",
      ffmpeg,
      ffprobe,
      libx264,
      thumbnailCacheWritable: thumbWritable,
      previewCacheWritable: previewWritable,
      previewEngineReady: ffmpeg.available && ffprobe.available && libx264 && thumbWritable && previewWritable,
      activeFfmpegJobs,
      maxFfmpegJobs: MAX_FFMPEG_JOBS
    });

  } catch (error) {
    res.status(500).json({ error: "Diagnostics failed.", detail: error.message });
  }
});

/* -------------------- Byte-range streaming -------------------- */

app.get("/api/stream", async (req, res) => {
  try {
    const filePath = resolveMedia(req.query.path);
    if (!filePath) return res.status(400).send("Invalid media path.");

    const { stats, extension } = await verifyMedia(filePath);
    const size = stats.size;

    res.setHeader("Content-Type", MIME[extension] || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");

    if (!req.headers.range) {
      res.setHeader("Content-Length", size);
      const stream = fs.createReadStream(filePath);
      stream.on("error", error => {
        console.error("[NEXORA] Stream error:", error);
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      });
      return stream.pipe(res);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || size === 0) {
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.status(416).end();
    }

    let start;
    let end;

    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return res.status(416).end();
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
    }

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.status(416).end();
    }

    end = Math.min(end, size - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", end - start + 1);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", error => {
      console.error("[NEXORA] Range stream error:", error);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    console.error("[NEXORA] Streaming error:", error);
    if (!res.headersSent) res.status(404).send("Unable to access media.");
  }
});

/* -------------------- Download -------------------- */

app.get("/api/download", async (req, res) => {
  try {
    const filePath = resolveMedia(req.query.path);
    if (!filePath) return res.status(400).send("Invalid media path.");

    const { extension } = await verifyMedia(filePath);
    res.setHeader("Content-Type", MIME[extension] || "application/octet-stream");

    res.download(filePath, path.basename(filePath), error => {
      if (error) {
        console.error("[NEXORA] Download error:", error.message);
        if (!res.headersSent) res.status(500).end("Download failed.");
      }
    });
  } catch (error) {
    console.error("[NEXORA] Download error:", error);
    if (!res.headersSent) res.status(404).send("Unable to download media.");
  }
});

app.listen(PORT, HOST, () => {
  console.log("\n========================================");
  console.log("          NEXORA MEDIA SERVER V7.4");
  console.log("========================================");
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`Library: ${MEDIA_ROOT}`);
  console.log("Status: ONLINE | Fast cached thumbnails: ENABLED | Short previews: ENABLED | Diagnostics: /api/diagnostics | Range streaming: ENABLED\n");
});
