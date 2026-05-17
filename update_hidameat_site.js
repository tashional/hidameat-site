const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

const ROOT = __dirname;
const IMAGE_DIR = path.join(ROOT, "hidameat");
const DATA_FILE = path.join(ROOT, "data.js");
const INDEX_URLS = [
  "https://hidameat.or.jp/market_post",
  "https://hidameat.or.jp/market_post/page/2"
];
const POST_RE = /https:\/\/hidameat\.or\.jp\/market_post\/market_post-[^"' ]+\.html/g;
const TITLE_RE = /<h3[^>]*>([^<]+)<\/h3>/;
const IMAGE_RE = /<img src="([^"]+)" alt="市況相場表"/;
const DATE_RE = /(\d{4})年(\d{1,2})月(\d{1,2})日開催/;

function toFileName(date) {
  return `${date}_牛枝肉相場.gif`;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function collectPosts() {
  const postSet = new Set();
  for (const url of INDEX_URLS) {
    const html = await fetchText(url);
    for (const match of html.matchAll(POST_RE)) {
      postSet.add(match[0]);
    }
  }

  const posts = [];
  for (const url of [...postSet]) {
    const html = await fetchText(url);
    const title = html.match(TITLE_RE)?.[1]?.trim();
    const imageUrl = html.match(IMAGE_RE)?.[1];
    const dateMatch = title?.match(DATE_RE);
    if (!title || !imageUrl || !dateMatch) {
      throw new Error(`Could not parse detail page: ${url}`);
    }
    const date = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`;
    posts.push({ url, title, imageUrl, date, fileName: toFileName(date) });
  }

  return posts.sort((a, b) => a.date.localeCompare(b.date));
}

async function syncImages(posts) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const keep = new Set(posts.map(post => post.fileName));

  for (const existing of fs.readdirSync(IMAGE_DIR)) {
    if (existing.endsWith(".gif") && !keep.has(existing)) {
      fs.unlinkSync(path.join(IMAGE_DIR, existing));
    }
  }

  for (const post of posts) {
    const buffer = await fetchBuffer(post.imageUrl);
    fs.writeFileSync(path.join(IMAGE_DIR, post.fileName), buffer);
  }
}

async function detectBottomLine(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  for (let y = 101; y < info.height; y++) {
    let dark = 0;
    const offset = y * info.width;
    for (let x = 0; x < info.width; x++) {
      if (data[offset + x] < 80) dark += 1;
    }
    if (dark > 500) {
      return y;
    }
  }
  throw new Error(`Bottom line not found: ${file}`);
}

async function extractWeightedAverage(worker, file) {
  const bottom = await detectBottomLine(file);
  const variants = [
    {
      extract: { left: 565, top: bottom - 24, width: 95, height: 22 },
      resize: { width: 950, height: 220 },
      threshold: 175
    },
    {
      extract: { left: 540, top: bottom - 25, width: 126, height: 24 },
      resize: { width: 1008, height: 192 },
      threshold: null
    }
  ];

  for (const variant of variants) {
    let pipeline = sharp(file)
      .extract(variant.extract)
      .resize({ ...variant.resize, fit: "fill" })
      .grayscale()
      .normalize();
    if (variant.threshold !== null) {
      pipeline = pipeline.threshold(variant.threshold);
    }
    const buffer = await pipeline.png().toBuffer();
    const { data } = await worker.recognize(buffer, {}, {
      tessedit_pageseg_mode: 7,
      tessedit_char_whitelist: "0123456789,"
    });
    const raw = data.text.replace(/[^\d,]/g, "");
    const match = raw.match(/\d,\d{3}|\d{4}/);
    if (!match) {
      continue;
    }
    const normalized = match[0].includes(",")
      ? match[0]
      : `${match[0].slice(0, -3)},${match[0].slice(-3)}`;
    const value = Number(normalized.replace(",", ""));
    if (value >= 1500 && value <= 4500) {
      return value;
    }
  }

  throw new Error(`OCR failed for ${path.basename(file)}`);
}

function buildDataFile(rows) {
  const generatedAt = new Date().toISOString();
  return `window.HIDAMEAT_DATA = ${JSON.stringify(rows, null, 2)};\nwindow.HIDAMEAT_GENERATED_AT = ${JSON.stringify(generatedAt)};\n`;
}

async function main() {
  const posts = await collectPosts();
  await syncImages(posts);

  const worker = await createWorker("eng");
  const rows = [];
  try {
    for (const post of posts) {
      const file = path.join(IMAGE_DIR, post.fileName);
      const weightedAverage = await extractWeightedAverage(worker, file);
      rows.push({ date: post.date, weightedAverage });
    }
  } finally {
    await worker.terminate();
  }

  fs.writeFileSync(DATA_FILE, buildDataFile(rows), "utf8");

  const latest = rows[rows.length - 1];
  console.log(JSON.stringify({
    count: rows.length,
    latestDate: latest?.date ?? null,
    latestValue: latest?.weightedAverage ?? null
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
