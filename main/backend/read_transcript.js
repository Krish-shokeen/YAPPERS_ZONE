import fs from 'fs';
import readline from 'readline';

const logPath = 'C:\\Users\\krish\\.gemini\\antigravity-ide\\brain\\d3058812-cf0a-40bd-b4f5-2e7095976a9f\\.system_generated\\logs\\transcript.jsonl';

async function run() {
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const lower = line.toLowerCase();
    if (lower.includes('console') && (lower.includes('error') || lower.includes('failed') || lower.includes('warning') || lower.includes('log'))) {
      console.log('--- FOUND ---');
      console.log(line.slice(0, 500)); // Print up to 500 chars of the line
    }
  }
}

run().catch(console.error);
