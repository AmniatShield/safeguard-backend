import express from "express";
import multer from "multer";
import fs from "fs";
import { exec } from "child_process";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
const baseURL = "https://api.avalai.ir/v1";

// Manually define __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vmname = "win10";
const cleanSnapshotName = "clean4";
const mlPath = "/opt/mal_sandbox";
let uploadedFileName = "vmt.ps1";

const openai = new OpenAI({
  apiKey: `aa-Wvn09ff6EKoCXiPk5wawvuDGO2Enl5V32Bat1yCnZd7VvN6r`,
  baseURL: baseURL,
});

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "new_public")));
// Ensure the uploads directory exists
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer Storage
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});

const upload = multer({ storage });

let pythonserver = exec(`python3 ${mlPath}/server/flask_server.py`);

pythonserver.on("spawn", () => {
  pythonserver.stdout.pipe(global.process.stdout);
  pythonserver.stderr.pipe(global.process.stderr);
  console.log(
    `[${currentTime()}] Python server is running at http://localhost:5000`
  );
});

let tcpdump = exec(`sudo tcpdump -i virbr0 > ${__dirname}/net.log`);
// Handle file upload
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  reset();
  uploadedFileName = req.file.filename;
  console.log(`[${currentTime()}] File recieved: ${req.file.filename}`);
  res.json({
    message: "File uploaded successfully!, starting the vm...",
    filename: req.file.filename,
    path: req.file.path,
  });
  const process = exec(`sudo virsh start ${vmname}`);
  process.stdout.pipe(global.process.stdout);
  process.stderr.pipe(global.process.stderr);
});

/*app.post("/analyze", express.json({limit: '60mb'}),(req, res) => {
  if (!req.body) {
    return res.status(400).send("No log provided.");
  }
  //fs.writeFileSync('./latest.log', req.body.log.toString());
  let b = callAI(req.body.log);
  // results = b.content || b.refusal || 'no response';
});*/
let results = null;
let results2 = null;
let netlog = null;
let analysis_log = null;
let aiChat = [];

app.post("/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  console.log(`[${currentTime()}] Log recieved: ${req.file.filename}`);
  let log = await fs.readFileSync(
    path.join(__dirname, "uploads", req.file.filename)
  );
  analysis_log = log;
  callAI(log);
  res.json({
    message: "File uploaded successfully!, starting the vm...",
    filename: req.file.filename,
    path: req.file.path,
  });
});
app.get("/update", async (req, res) => {
  let fileHash = await createMD5(
    path.join(__dirname, "uploads", uploadedFileName)
  );
  let fileSize = getFileSize(path.join(__dirname, "uploads", uploadedFileName));
  let maltypes = await getPercentages(path.join(__dirname, "collector.json"));
  //console.log(`Sending malware type predictions: ${JSON.stringify(maltypes)}`);
  res.send(
    JSON.stringify({
      results: results,
      fileHash: fileHash,
      fileSize: fileSize,
      fileName: uploadedFileName,
      maltypes: maltypes,
    })
  );
});

app.get("/download", (req, res) => {
  const filePath = path.join(__dirname, "uploads", uploadedFileName);
  res.download(filePath);
});
app.post("/ai", async (req, res) => {
  if (!req.body) {
    return res.status(400).send("No body provided.");
  }
  aiChat.push(`[User]: ${req.body.message}`);
  let b = await getAIAnswer();
  res.send(JSON.stringify({ result: b }));
});

app.get("/reset", async (req, res) => {
  reset();
});
function reset() {
  uploadedFileName = "vmt.ps1";
  results = null;
  results2 = null;
  analysis_log = null;
  netlog = null;
  aiChat = [];
  const process = exec(`sudo virsh shutdown ${vmname}`);
  fs.unlink(path.join(__dirname, "collector.json"), (err) => {
    if (err) console.error("Failed to delete log:", err);
  });
  fs.unlink(path.join(__dirname, "net.log"), (err) => {
    if (err) console.error("Failed to delete log:", err);
  });
  console.log(`[${currentTime()}] Reset!`);
}
// Start the server
app.listen(port, () => {
  console.log(`[${currentTime()}] Server running at http://localhost:${port}`);
});
async function callAI(log) {
  const process = exec(`sudo virsh shutdown ${vmname}`);
  process.stdout.pipe(global.process.stdout);
  process.stderr.pipe(global.process.stderr);
  let llog = log ?? `No log supplied`;
  netlog = getNetworkLog();
  const message = `
You are an expert malware analyst.
Your task is to analyze a log file generated by a malware testing sandbox. The log includes detailed information about the program’s actions during execution (such as file operations, network activity, registry access, API calls, memory usage, and process behavior).

Your goal is to carefully review the log and provide a human-readable summary in simple Persian that explains what the program did and whether it is safe to run on a normal user’s computer.

Follow these rules exactly:

Do not mention that you are an AI or GPT model.

Do not include any formatting — no bold text, bullet points, markdown, or lists.

The total response must not exceed 1500 characters.

The first sentence must be one of the following depending on your conclusion:

"این برنامه امن است."

"این برنامه امن نیست."

After the first sentence, write a short but informative explanation that summarizes the main behaviors observed in the log.
طح هسته ویندوز استفاده می‌شوند. توابع Io برای ایجاد و مدیریت دستگاه‌ها و درایورهای ورودی/خروجی (I/O) هستند.
If there are any suspicious actions, describe them clearly and concisely in Persian — for example:

دسترسی غیرعادی به رجیستری

تلاش برای دانلود یا آپلود فایل از اینترنت

ساخت یا حذف فایل‌های سیستمی

اجرای پردازش‌های ناشناس یا تزریق کد

تغییر تنظیمات سیستم یا شبکه

If the behavior looks normal (for example, only reading harmless files or performing limited local operations), clearly state that no malicious or dangerous activity was detected.

You may mention patterns that look similar to known malware behavior, but avoid using technical jargon that the average reader wouldn’t understand.

Write your summary in a natural, fluent, and easy-to-understand Persian style, as if you are explaining it to a regular computer user who has no deep technical knowledge.

Here is the network connections made by the malware:
${netlog}
Here is the log you will analyze:
${llog}
`;
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: message }],
    model: "gemini-flash-latest",
  });
  results = chatCompletion.choices[0].message.content;
  aiChat.push(`[AI]: ${results}`);
  results2 = results;
  setTimeout(() => {
    revertSnapshot();
  }, 10000);
}
function revertSnapshot() {
  const snapshot = exec(
    `sudo virsh snapshot-revert ${vmname} ${cleanSnapshotName}`
  );
  snapshot.stdout.pipe(global.process.stdout);
  snapshot.stderr.pipe(global.process.stderr);
}
async function getAIAnswer() {
  let r = null;
  const message = `
You are a malware analysis assistant.
You have access to a log generated by a malware testing sandbox and a previous summary analysis.
Your task is to answer the user's specific question based on the log and previous analysis.

Follow these rules strictly:

Do not mention that you are an AI or GPT model.

Do not repeat or restate the previous analysis — answer the question directly and concisely.

Your response must be in simple, clear Persian, no longer than 300 characters, and without any formatting (no bold text, lists, or symbols).

Your only job is to answer the user’s question, even if the data is limited — never respond with phrases like "اطلاعات کافی وجود ندارد" or "نمیتوان گفت".

If the answer depends on the log or previous analysis, use logical reasoning from them, but do not quote or restate them.

Write naturally, as if you are explaining the result to a regular user.

Here is the chat history:
${aiChat.join("\n")}

Here is the sandbox log:
${analysis_log}

`;
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: message }],
    model: "gemini-flash-latest",
  });
  r = chatCompletion.choices[0].message.content;
  aiChat.push(`[AI]: ${r}`);
  return r;
}
async function createMD5(filePath) {
  // Check if the file exists at the specified path
  if (!fs.existsSync(filePath))
    throw new Error(
      `The specified file "${filePath}" does not exist. Please check the path and try again.`
    );

  // Check if the specified path is a directory
  if (fs.statSync(filePath).isDirectory()) return;

  // Check if the file is readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (e) {
    throw new Error(
      `The file "${filePath}" is not readable. Please check your permissions.`
    );
  }

  // Create an MD5 hash object
  const hash = crypto.createHash("md5");
  // Create a read stream for the file
  const rStream = fs.createReadStream(filePath);

  // Read the file in chunks
  let data = "";
  for await (const chunk of rStream) data += chunk;

  // Update the hash with data
  hash.update(data);

  // Return the final hash as a hexadecimal string
  return hash.digest("hex");
}
function getFileSize(filePath) {
  var stats = fs.statSync(filePath);
  var fileSizeInBytes = stats.size;
  // Convert the file size to megabytes (optional)
  var fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
  return fileSizeInMegabytes;
}

function currentTime() {
  return new Date().toLocaleString();
}
function getLabelAndDelete(logPath, callback) {
  // Read the fileb
  fs.readFile(logPath, "utf8", (err, content) => {
    if (err || !content.trim()) return callback(null);

    let js = JSON.parse(content);
    callback(js.percentages);
    /*fs.unlink(logPath, (err) => {
      if (err) console.error("Failed to delete log:", err);
      return callback(label);
    });*/
  });
}
function getPercentages(logPath) {
  return new Promise((resolve) => {
    getLabelAndDelete(logPath, (label) => {
      resolve(label);
    });
  });
}
function getNetworkLog() {
  try {
    const data = fs.readFileSync(path.join(__dirname, "net.log"), "utf8");
    return data;
  } catch (err) {
    console.error("Error reading file:", err);
    return null;
  }
}
