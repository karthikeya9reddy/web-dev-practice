// NEXORA V7.8.3 — Unified Featured Sequence & Quote Removal
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
const SUBTITLE_ROOT = path.join(PUBLIC_ROOT, "assets", "subtitles");

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
fs.mkdirSync(SUBTITLE_ROOT, { recursive: true });
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
  res.json({ success: true, server: "NEXORA", version: "7.8.3", status: "online" });
});

app.get("/api/library", async (req, res) => {
  try {
    const result = await scanDirectory(MEDIA_ROOT);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      version: "7.8.3",
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

/* -------------------- High-resolution representative thumbnails + previews --------

   V7.4 fixes the biggest latency problem in V7.3.1:
   the prior thumbnail route spawned up to FIVE FFmpeg processes in series
   for every new video. The new path probes duration once, stores one stable
   scene timestamp, then uses ONE FFmpeg extraction per requested thumbnail
   size. Both the thumbnail and short preview use the same saved timestamp.

----------------------------------------------------------------------------- */

const thumbnailJobs = new Map();
const metadataJobs = new Map();
const previewJobs = new Map();

const THUMBNAIL_ALGORITHM = "nexora-poster-1920px-v6";
const PREVIEW_ALGORITHM = "nexora-muted-preview-h264-1080p-v6";

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

const videoStreamJobs = new Map();

function parseFrameRate(value) {
  const match = String(value || "").match(/^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
  if (!match) return 24;
  const numerator = Number(match[1]);
  const denominator = match[2] ? Number(match[2]) : 1;
  const rate = denominator > 0 ? numerator / denominator : 24;
  return Number.isFinite(rate) && rate > 0 ? Math.min(30, Math.max(1, Math.round(rate))) : 24;
}

async function getPrimaryVideoStream(filePath, suppliedStats = null) {
  const stats = suppliedStats || await fs.promises.stat(filePath);
  const cacheKey = `${filePath}:${stats.size}:${stats.mtimeMs}`;
  if (videoStreamJobs.has(cacheKey)) return videoStreamJobs.get(cacheKey);

  const job = runTool("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=index,codec_type,width,height,avg_frame_rate,r_frame_rate:stream_disposition=attached_pic,default",
    "-of", "json",
    filePath
  ], { timeout: 25000, maxBuffer: 4 * 1024 * 1024 }).then(({ stdout }) => {
    const parsed = JSON.parse(String(stdout || "{}"));
    const candidates = (Array.isArray(parsed.streams) ? parsed.streams : [])
      .filter(stream => stream.codec_type === "video" && Number(stream.disposition?.attached_pic || 0) !== 1)
      .map(stream => ({
        index: Number(stream.index),
        width: Number(stream.width),
        height: Number(stream.height),
        frameRate: parseFrameRate(stream.avg_frame_rate || stream.r_frame_rate),
        isDefault: Number(stream.disposition?.default || 0) === 1
      }))
      .filter(stream => Number.isInteger(stream.index) && stream.width > 0 && stream.height > 0);

    if (!candidates.length) throw new Error("FFprobe could not find a real video stream (attached cover art is ignored).");
    // Some MKV/MP4 files contain a low-resolution proxy before the main track.
    // Select the highest-resolution real video stream, preferring default only
    // when two streams have equal pixel area.
    candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height) || Number(b.isDefault) - Number(a.isDefault));
    const { index, width, height, frameRate } = candidates[0];
    return { index, width, height, frameRate };
  }).catch(error => {
    videoStreamJobs.delete(cacheKey);
    throw error;
  });

  videoStreamJobs.set(cacheKey, job);
  if (videoStreamJobs.size > 128) videoStreamJobs.delete(videoStreamJobs.keys().next().value);
  return job;
}

async function getVideoDimensions(filePath) {
  const stream = await getPrimaryVideoStream(filePath);
  return { width: stream.width, height: stream.height };
}

function expectedPreviewDimensions(source, maxHeight = 1080) {
  const maxWidth = maxHeight === 720 ? 1280 : 1920;
  const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height);
  return {
    width: Math.max(2, Math.floor(source.width * scale / 2) * 2),
    height: Math.max(2, Math.floor(source.height * scale / 2) * 2)
  };
}

function dimensionsMatch(actual, expected) {
  return Math.abs(actual.width - expected.width) <= 2 &&
    Math.abs(actual.height - expected.height) <= 2;
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
  const width = Math.max(240, Math.min(2560, Number(requested) || 640));
  if (width <= 360) return 320;
  if (width <= 700) return 640;
  if (width <= 960) return 960;
  if (width <= 1280) return 1280;
  return 1920;
}

function previewWindow(metadata, requestedDuration = 8) {
  const duration = Number(metadata?.duration);
  const requested = Number(requestedDuration);
  const wanted = Number.isFinite(requested) ? Math.max(4, Math.min(12, requested)) : 8;
  const clipLength = Math.min(wanted, duration);
  const timestamp = Number(metadata?.timestamp) || 0;
  const start = Math.max(0, Math.min(timestamp - Math.min(0.65, clipLength * 0.12), duration - clipLength));
  return { start, clipLength };
}

function thumbnailCachePath(filePath, stats, width, variant = "representative") {
  // Keep the existing card/library poster cache identity untouched. Discover
  // gets a separate exact-frame poster key so it can match the preview's first frame.
  const variantKey = variant === "representative" ? "" : `:${variant}`;
  const key = hashKey(
    `${THUMBNAIL_ALGORITHM}${variantKey}:${filePath}:${stats.size}:${stats.mtimeMs}:w${width}`
  );
  return path.join(THUMB_ROOT, `${key}.jpg`);
}

async function createThumbnail(filePath, output, metadata, width, streamIndex, alignedStart = null) {
  const aligned = Number.isFinite(alignedStart);
  const start = aligned ? alignedStart : metadata.timestamp;
  const sampleLength = Math.max(0.45, Math.min(2.4, Math.max(0.45, metadata.duration - start)));
  const temp = `${output}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}.jpg`;
  const scaleFilter = `scale=w='min(${width},iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setsar=1`;
  const outputFilter = aligned ? `${scaleFilter},format=yuvj420p` : `thumbnail=24,${scaleFilter},eq=contrast=1.04:saturation=1.08`;

  const buildArgs = (includeSampleWindow, filter, quality) => {
    const args = ["-hide_banner", "-loglevel", "error", "-ss", timeString(start), "-i", filePath];
    if (includeSampleWindow) args.push("-t", timeString(sampleLength));
    args.push(
      "-map", `0:${streamIndex}`, "-an", "-sn", "-dn",
      "-vf", filter, "-frames:v", "1", "-q:v", String(quality), "-y", temp
    );
    return args;
  };

  try {
    // Discover uses the exact opening frame of the preview clip; all other
    // posters retain the original representative-frame sampling behaviour.
    await runTool("ffmpeg", buildArgs(!aligned, outputFilter, aligned ? 1 : 2), {
      timeout: 50000, maxBuffer: 3 * 1024 * 1024
    });
    const info = await fs.promises.stat(temp);
    if (!info.isFile() || info.size < 1200) throw new Error("FFmpeg returned an empty poster frame.");
  } catch (primaryError) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    const fallbackFilter = `${scaleFilter},format=yuvj420p`;
    await runTool("ffmpeg", buildArgs(false, fallbackFilter, 1), {
      timeout: 35000, maxBuffer: 3 * 1024 * 1024
    });
    const info = await fs.promises.stat(temp);
    if (!info.isFile() || info.size < 1200) throw new Error(`Poster extraction failed: ${primaryError.message}`);
  }

  await fs.promises.rename(temp, output);
}

async function ensureThumbnail(filePath, stats, requestedWidth, options = {}) {
  const [metadata, sourceStream] = await Promise.all([
    getSceneMetadata(filePath, stats),
    getPrimaryVideoStream(filePath, stats)
  ]);
  const width = thumbnailWidthBucket(requestedWidth);
  const aligned = options.previewAligned === true;
  const window = aligned ? previewWindow(metadata, options.duration || 8) : null;
  const alignedStart = window ? window.start : null;
  const variant = window ? `discover-preview-start-${timeString(window.start)}-d${timeString(window.clipLength)}` : "representative";
  const output = thumbnailCachePath(filePath, stats, width, variant);

  try {
    const cached = await fs.promises.stat(output);
    if (cached.isFile() && cached.size >= 1200) {
      return { output, metadata, width, cached: true, sourceStream, aligned, frameTimestamp: alignedStart ?? metadata.timestamp };
    }
  } catch {
    // Generate below.
  }

  if (!thumbnailJobs.has(output)) {
    const job = withFfmpegSlot(() =>
      createThumbnail(filePath, output, metadata, width, sourceStream.index, alignedStart)
    ).finally(() => thumbnailJobs.delete(output));
    thumbnailJobs.set(output, job);
  }

  await thumbnailJobs.get(output);
  return { output, metadata, width, cached: false, sourceStream, aligned, frameTimestamp: alignedStart ?? metadata.timestamp };
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


/* -------------------- Subtitle discovery and delivery --------------------

   Sidecar subtitles are searched only beside the requested video and must
   share its filename stem (for example Film.en.srt or Film.vtt). SRT files
   are converted to WebVTT for the browser. Text-based embedded subtitle
   streams are extracted through FFmpeg and cached. Bitmap subtitle codecs
   such as PGS/DVD subtitles are reported as unsupported because they need
   OCR rather than ordinary WebVTT conversion.

---------------------------------------------------------------------------- */

const subtitleJobs = new Map();
const SUBTITLE_EXTENSIONS = new Set(["srt", "vtt", "ass", "ssa"]);
const BITMAP_SUBTITLE_CODECS = new Set([
  "hdmv_pgs_subtitle", "dvd_subtitle", "dvb_subtitle", "xsub"
]);

function normaliseLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["en", "eng", "english"].includes(raw)) return "en";
  if (["es", "spa", "spanish"].includes(raw)) return "es";
  if (["fr", "fra", "fre", "french"].includes(raw)) return "fr";
  if (["de", "deu", "ger", "german"].includes(raw)) return "de";
  if (["it", "ita", "italian"].includes(raw)) return "it";
  if (["ja", "jpn", "japanese"].includes(raw)) return "ja";
  if (["ko", "kor", "korean"].includes(raw)) return "ko";
  if (["zh", "zho", "chi", "chinese"].includes(raw)) return "zh";
  if (["hi", "hin", "hindi"].includes(raw)) return "hi";
  return raw.length >= 2 && raw.length <= 3 ? raw : "und";
}

function languageLabel(language, fallback = "Subtitles") {
  const labels = {
    en: "English", es: "Spanish", fr: "French", de: "German",
    it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese", hi: "Hindi"
  };
  const normal = normaliseLanguage(language);
  return labels[normal] || fallback;
}

function languageFromSidecar(filename, stem) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  const suffix = filename.slice(stem.length, filename.length - extension.length - 1)
    .replace(/^[._ -]+/, "");
  const tokens = suffix.split(/[._ -]+/).filter(Boolean);
  const known = tokens.find(token => /^(en|eng|english|es|spa|spanish|fr|fra|fre|french|de|deu|ger|german|it|ita|ja|jpn|ko|kor|zh|zho|hi|hin)$/i.test(token));
  return normaliseLanguage(known || "und");
}

async function getExternalSubtitleCandidates(videoPath) {
  const directory = path.dirname(videoPath);
  const stem = path.basename(videoPath, path.extname(videoPath));
  const prefix = `${stem}.`.toLowerCase();
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const tracks = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (!SUBTITLE_EXTENSIONS.has(ext)) continue;
    if (!entry.name.toLowerCase().startsWith(prefix)) continue;

    const sidecar = path.join(directory, entry.name);
    const relative = path.relative(MEDIA_ROOT, sidecar);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;

    try {
      const info = await fs.promises.lstat(sidecar);
      if (!info.isFile() || info.isSymbolicLink()) continue;
    } catch {
      continue;
    }

    const language = languageFromSidecar(entry.name, stem);
    const languageName = languageLabel(language, "External subtitles");
    tracks.push({
      id: `external:${entry.name}`,
      label: language === "und" ? `${languageName} (${ext.toUpperCase()})` : languageName,
      language,
      source: "external",
      format: ext
    });
  }

  tracks.sort((a, b) => {
    if (a.language === "en" && b.language !== "en") return -1;
    if (b.language === "en" && a.language !== "en") return 1;
    return a.label.localeCompare(b.label);
  });

  return tracks;
}

async function getEmbeddedSubtitleCandidates(videoPath) {
  let result;
  try {
    result = await runTool("ffprobe", [
      "-v", "error",
      "-select_streams", "s",
      "-show_entries", "stream=index,codec_name:stream_tags=language,title",
      "-of", "json",
      videoPath
    ], { timeout: 25000, maxBuffer: 3 * 1024 * 1024 });
  } catch (error) {
    // External sidecars remain available when embedded subtitle probing fails.
    console.warn("[NEXORA] Embedded subtitle probe failed:", error.message);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout || "{}"));
  } catch {
    return [];
  }

  const tracks = [];
  for (const stream of parsed.streams || []) {
    const codec = String(stream.codec_name || "").toLowerCase();
    if (!Number.isInteger(Number(stream.index))) continue;
    if (!codec || BITMAP_SUBTITLE_CODECS.has(codec)) continue;

    const tags = stream.tags || {};
    const language = normaliseLanguage(tags.language || "und");
    const title = String(tags.title || "").trim();
    const label = title || languageLabel(language, `Subtitle track ${stream.index}`);

    tracks.push({
      id: `embedded:${Number(stream.index)}`,
      label: language === "en" && !/english/i.test(label) ? `English · ${label}` : label,
      language,
      source: "embedded",
      codec,
      streamIndex: Number(stream.index)
    });
  }

  tracks.sort((a, b) => {
    if (a.language === "en" && b.language !== "en") return -1;
    if (b.language === "en" && a.language !== "en") return 1;
    return a.label.localeCompare(b.label);
  });

  return tracks;
}

function srtToWebVtt(input) {
  let text = String(input || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  text = text.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  text = text.replace(/(^|\n)(\d+)\n(?=\d{1,2}:\d{2}:\d{2}\.\d{3}\s+-->)/g, "$1");
  return `WEBVTT\n\n${text}\n`;
}

async function safelyResolveSidecar(videoPath, filename) {
  if (typeof filename !== "string" || path.basename(filename) !== filename) return null;
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (!SUBTITLE_EXTENSIONS.has(extension)) return null;

  const videoStem = path.basename(videoPath, path.extname(videoPath)).toLowerCase();
  if (!filename.toLowerCase().startsWith(`${videoStem}.`)) return null;

  const candidate = path.join(path.dirname(videoPath), filename);
  const relative = path.relative(MEDIA_ROOT, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;

  try {
    const stat = await fs.promises.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    return { path: candidate, stat, extension };
  } catch {
    return null;
  }
}

async function convertSidecarToVtt(sidecar, output) {
  const temp = `${output}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}.vtt`;
  try {
    if (sidecar.extension === "srt") {
      const input = await fs.promises.readFile(sidecar.path, "utf8");
      await fs.promises.writeFile(temp, srtToWebVtt(input), "utf8");
    } else {
      await runTool("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", sidecar.path, "-f", "webvtt", "-y", temp], { timeout: 60000, maxBuffer: 3 * 1024 * 1024 });
      const stat = await fs.promises.stat(temp);
      if (!stat.isFile() || stat.size <= 12) throw new Error("Subtitle conversion produced an empty WebVTT file.");
    }
    await fs.promises.rename(temp, output);
  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

async function extractEmbeddedWebVtt(videoPath, stats, streamIndex) {
  const key = hashKey(`nexora-embedded-subtitle-v1:${videoPath}:${stats.size}:${stats.mtimeMs}:${streamIndex}`);
  const output = path.join(SUBTITLE_ROOT, `${key}.vtt`);

  try {
    const cached = await fs.promises.stat(output);
    if (cached.isFile() && cached.size > 12) return output;
  } catch {
    // Generate below.
  }

  if (!subtitleJobs.has(output)) {
    const job = withFfmpegSlot(async () => {
      const temp = `${output}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}.vtt`;
      try {
        await runTool("ffmpeg", [
          "-hide_banner", "-loglevel", "error",
          "-i", videoPath,
          "-map", `0:${streamIndex}`,
          "-f", "webvtt",
          "-y", temp
        ], { timeout: 90000, maxBuffer: 3 * 1024 * 1024 });
        const stat = await fs.promises.stat(temp);
        if (!stat.isFile() || stat.size <= 12) {
          throw new Error("FFmpeg produced an empty embedded subtitle track.");
        }
        await fs.promises.rename(temp, output);
      } catch (error) {
        await fs.promises.rm(temp, { force: true }).catch(() => {});
        throw error;
      }
    }).finally(() => subtitleJobs.delete(output));
    subtitleJobs.set(output, job);
  }

  await subtitleJobs.get(output);
  return output;
}

app.get("/api/subtitles", async (req, res) => {
  try {
    const filePath = resolveMedia(req.query.path);
    if (!filePath) return res.status(400).json({ error: "Invalid media path." });
    const { extension } = await verifyMedia(filePath);
    if (!VIDEO.has(extension)) return res.status(415).json({ error: "Subtitles are available for video files only." });

    const [external, embedded] = await Promise.all([
      getExternalSubtitleCandidates(filePath),
      getEmbeddedSubtitleCandidates(filePath)
    ]);

    const tracks = [...external, ...embedded];
    tracks.sort((a, b) => {
      if (a.language === "en" && b.language !== "en") return -1;
      if (b.language === "en" && a.language !== "en") return 1;
      if (a.source !== b.source) return a.source === "external" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, tracks });
  } catch (error) {
    console.error("[NEXORA] Subtitle discovery error:", error.stack || error.message);
    res.status(503).json({ error: "Subtitle discovery failed.", detail: error.message });
  }
});

app.get("/api/subtitle", async (req, res) => {
  try {
    const filePath = resolveMedia(req.query.path);
    if (!filePath) return res.status(400).send("Invalid media path.");
    const { stats, extension } = await verifyMedia(filePath);
    if (!VIDEO.has(extension)) return res.status(415).send("Subtitles are available for videos only.");

    const id = String(req.query.id || "");
    let output;

    if (id.startsWith("external:")) {
      const filename = id.slice("external:".length);
      const sidecar = await safelyResolveSidecar(filePath, filename);
      if (!sidecar) return res.status(404).send("Subtitle file not found.");

      if (sidecar.extension === "vtt") {
        res.setHeader("Content-Type", "text/vtt; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.sendFile(sidecar.path);
      }

      const key = hashKey(`nexora-sidecar-${sidecar.extension}-v2:${sidecar.path}:${sidecar.stat.size}:${sidecar.stat.mtimeMs}`);
      output = path.join(SUBTITLE_ROOT, `${key}.vtt`);
      try {
        const cached = await fs.promises.stat(output);
        if (!cached.isFile() || cached.size <= 12) throw new Error("Invalid subtitle cache.");
      } catch {
        await convertSidecarToVtt(sidecar, output);
      }
    } else if (id.startsWith("embedded:")) {
      const streamIndex = Number(id.slice("embedded:".length));
      if (!Number.isInteger(streamIndex) || streamIndex < 0) return res.status(400).send("Invalid subtitle stream.");
      const tracks = await getEmbeddedSubtitleCandidates(filePath);
      const track = tracks.find(item => item.streamIndex === streamIndex);
      if (!track) return res.status(404).send("Embedded subtitle track not found or unsupported.");
      output = await extractEmbeddedWebVtt(filePath, stats, streamIndex);
    } else {
      return res.status(400).send("Invalid subtitle identifier.");
    }

    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.sendFile(output);
  } catch (error) {
    console.error("[NEXORA] Subtitle delivery error:", error.stack || error.message);
    if (!res.headersSent) res.status(503).send(`Subtitle conversion failed: ${error.message}`);
  }
});

app.get("/api/thumbnail", async (req, res) => {
  try {
    const filePath = resolveMedia(req.query.path);
    if (!filePath) return res.status(400).json({ error: "Invalid media path." });

    const { stats, extension } = await verifyMedia(filePath);
    if (!VIDEO.has(extension)) {
      return res.status(415).json({ error: "Posters are available for video files only." });
    }

    const previewAligned = String(req.query.frame || "") === "preview";
    const result = await ensureThumbnail(filePath, stats, req.query.w, {
      previewAligned,
      duration: Number(req.query.duration) || 8
    });
    res.setHeader("X-Nexora-Thumbnail-Width-Bucket", String(result.width));
    res.setHeader("X-Nexora-Thumbnail-Source-Width", String(result.sourceStream.width));
    res.setHeader("X-Nexora-Thumbnail-Source-Height", String(result.sourceStream.height));
    res.setHeader("X-Nexora-Thumbnail-Stream-Index", String(result.sourceStream.index));
    res.setHeader("X-Nexora-Thumbnail-Algorithm", THUMBNAIL_ALGORITHM);
    res.setHeader("X-Nexora-Thumbnail-Preview-Aligned", String(result.aligned));
    res.setHeader("X-Nexora-Thumbnail-Frame-Timestamp", String(result.frameTimestamp));
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

/* -------------------- Source-aware 1080p short muted preview clips ---------------- */

async function createPreviewClip(filePath, output, start, duration, sourceStream, maxHeight) {
  const temp = `${output}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}.mp4`;

  try {
    const sourceDimensions = { width: sourceStream.width, height: sourceStream.height };
    const expectedDimensions = expectedPreviewDimensions(sourceDimensions, maxHeight);
    const maxWidth = maxHeight === 720 ? 1280 : 1920;
    const frameRate = sourceStream.frameRate || 24;
    await runTool("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", timeString(start),
      "-i", filePath,
      "-t", timeString(duration),
      "-map", `0:${sourceStream.index}`,
      "-an", "-sn", "-dn",
      // Preserve full source detail up to 1080p. High-quality Lanczos scaling
      // is used only when the source exceeds the requested output dimensions.
      "-vf", `scale=w='min(${maxWidth},iw)':h='min(${maxHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,setsar=1,fps=${frameRate},format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "18",
      "-profile:v", "high",
      "-level:v", maxHeight === 720 ? "3.1" : "4.2",
      "-g", String(frameRate * 2),
      "-keyint_min", String(frameRate * 2),
      "-sc_threshold", "0",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-threads", "2",
      "-y", temp
    ], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });

    const result = await fs.promises.stat(temp);
    if (!result.isFile() || result.size < 6000) {
      throw new Error("FFmpeg produced an invalid preview clip.");
    }
    const actualDimensions = await getVideoDimensions(temp);
    if (!dimensionsMatch(actualDimensions, expectedDimensions)) {
      throw new Error(`Preview resolution verification failed: expected ${expectedDimensions.width}x${expectedDimensions.height}, received ${actualDimensions.width}x${actualDimensions.height}.`);
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

    const [metadata, sourceStream] = await Promise.all([
      getSceneMetadata(filePath, stats),
      getPrimaryVideoStream(filePath, stats)
    ]);
    const sourceDimensions = { width: sourceStream.width, height: sourceStream.height };
    const requestedQuality = Number(req.query.quality) || 1080;
    const maxHeight = requestedQuality <= 720 ? 720 : 1080;
    const expectedDimensions = expectedPreviewDimensions(sourceDimensions, maxHeight);
    const duration = metadata.duration;

    if (!Number.isFinite(duration) || duration < 1.5) {
      return res.status(422).json({ error: "This video is too short to preview." });
    }

    const { start, clipLength } = previewWindow(metadata, req.query.duration);

    const cacheKey = hashKey(
      `${PREVIEW_ALGORITHM}:q${maxHeight}:${filePath}:${stats.size}:${stats.mtimeMs}:${start.toFixed(3)}:${clipLength.toFixed(3)}:stream${sourceStream.index}`
    );

    const output = path.join(PREVIEW_ROOT, `${cacheKey}.mp4`);

    try {
      const cached = await fs.promises.stat(output);
      if (!cached.isFile() || cached.size < 4000) {
        throw new Error("Preview cache entry is invalid.");
      }
      const cachedDimensions = await getVideoDimensions(output);
      if (!dimensionsMatch(cachedDimensions, expectedDimensions)) {
        throw new Error("Cached preview resolution is outdated; rebuilding it.");
      }
    } catch {
      await fs.promises.rm(output, { force: true }).catch(() => {});
      if (!previewJobs.has(output)) {
        const job = withFfmpegSlot(() =>
          createPreviewClip(filePath, output, start, clipLength, sourceStream, maxHeight)
        ).finally(() => previewJobs.delete(output));

        previewJobs.set(output, job);
      }

      await previewJobs.get(output);
    }

    // Express sendFile/send supports HTTP Range responses. This is important
    // for browsers that probe or seek in the generated MP4 clip.
    const previewDimensions = await getVideoDimensions(output);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("X-Nexora-Preview-Width", String(previewDimensions.width));
    res.setHeader("X-Nexora-Preview-Height", String(previewDimensions.height));
    res.setHeader("X-Nexora-Source-Width", String(sourceDimensions.width));
    res.setHeader("X-Nexora-Source-Height", String(sourceDimensions.height));
    res.setHeader("X-Nexora-Source-Stream-Index", String(sourceStream.index));
    res.setHeader("X-Nexora-Preview-Max-Height", String(maxHeight));
    res.setHeader("X-Nexora-Preview-Start", timeString(start));
    res.setHeader("X-Nexora-Preview-Algorithm", PREVIEW_ALGORITHM);
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
      version: "7.8.3",
      ffmpeg,
      ffprobe,
      libx264,
      previewAlgorithm: PREVIEW_ALGORITHM,
      previewTarget: { maxWidth: 1920, maxHeight: 1080, frameRate: "source-capped-at-30", crf: 18, preset: "fast" },
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
  console.log("          NEXORA MEDIA SERVER V7.8.3");
  console.log("========================================");
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`Library: ${MEDIA_ROOT}`);
  console.log("Status: ONLINE | 1920px thumbnails: ENABLED | Verified 1080p-capable previews: ENABLED | Diagnostics: /api/diagnostics | Range streaming: ENABLED\n");
});
