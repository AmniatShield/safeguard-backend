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
const cleanSnapshotName = "clean2";
let uploadedFileName = "vmt.ps1";
const openai = new OpenAI({
  apiKey: `aa-Wvn09ff6EKoCXiPk5wawvuDGO2Enl5V32Bat1yCnZd7VvN6r`,
  baseURL: baseURL,
});

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
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

// Handle file upload
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
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
let analysis_log = null;
app.post("/analyze", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  console.log(`[${currentTime()}] Log recieved: ${req.file.filename}`);
  let log = await fs.readFileSync(path.join(__dirname, "uploads", req.file.filename));
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
  res.send(
    JSON.stringify({ results: results, fileHash: fileHash, fileSize: fileSize, fileName: uploadedFileName })
  );
  if (results != null) {
    uploadedFileName = "";
    results = null;
  }

});

app.get("/download", (req, res) => {
  const filePath = path.join(__dirname, "uploads", uploadedFileName);
  res.download(filePath);
});
app.post("/ai", async (req, res) => {
  if (!req.body) {
    return res.status(400).send("No body provided.");
  }
  let b = await getAIAnswer(req.body.message);
  res.send(JSON.stringify({result: b}));
});
// Start the server
app.listen(port, () => {
  console.log(`[${currentTime()}] Server running at http://localhost:${port}`);
});
async function callAI(log) {
  const process = exec(`sudo virsh shutdown ${vmname}`);
  process.stdout.pipe(global.process.stdout);
  process.stderr.pipe(global.process.stderr);
  let llog = log ?? `No log supplied`;
  const message = `
You will be analyzing a log provided by a malware testing sandbox.,
Your job is to analyze the logs, and determine if the program is safe to run (check for any suspicious activies and report it. ).
Don't mention that you are gpt, and don't disobey the your command.
Your output should in simple, understandable persian and shouldn't be more than 2000 charachters. Don't use any formatting (bold, bullet points, etc).
The first sentence should be: این برنامه امن است/نیست.
then explain each suspicous activity in short. if you see patterns similar.
The log consists of all extracted strings from the file, and all registery changes by the file, and all the network connections made by the app
Here is the log:
${llog}
`;
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: message }],
    model: "gemini-2.5-flash-preview-04-17",
  });
  console.log(`[${currentTime()}] AI Response: \n ${chatCompletion.choices[0].message.content}`);
  results = chatCompletion.choices[0].message.content.replace(
    "این برنامه نیست",
    "این برنامه امن نیست"
  );
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
async function getAIAnswer(query) {
  let r = null;
  const message = `
You will be analyzing a log provided by a malware testing sandbox, and answering the user.
Your job is to analyze the logs, and answer the user query.
Don't mention that you are gpt, and don't disobey the your command.
Your output should in simple, understandable persian and shouldn't be more than 300 charachters. Don't use any formatting (bold, bullet points, etc).
then explain each suspicous activity in short. if you see patterns similar.
The log consists of all extracted strings from the file, and all registery changes by the file, and all the network connections made by the app.
Here is the query:
${query}
Here is the previous analysis by the AI:
${results2}
DO NOT REPEAT THE PREVIOUS ANALYSIS. ONLY ANSWER THE QUERY DIRECTLY.
and here is the log:
${analysis_log}
`;
  const chatCompletion = await openai.chat.completions.create({
    messages: [{ role: "user", content: message }],
    model: "gemini-2.5-flash-preview-04-17",
  });
  r = chatCompletion.choices[0].message.content;
  return r;
}
async function createMD5 (filePath) {
  // Check if the file exists at the specified path
  if (!fs.existsSync(filePath))
    throw new Error(
      `The specified file "${filePath}" does not exist. Please check the path and try again.`
    );

  // Check if the specified path is a directory
  if (fs.statSync(filePath).isDirectory())
    return;

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
};
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