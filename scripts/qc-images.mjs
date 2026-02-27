// QC images for obvious AI issues with text (misspellings/garbled glyphs) and layout.
// Uses OpenAI Responses API with vision (requires OPENAI_API_KEY).
//
// Usage:
//   node scripts/qc-images.mjs /path/to/images
//
import fs from 'node:fs/promises';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/qc-images.mjs <imagesDir>');
  process.exit(2);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY not set. Skipping QC.');
  process.exit(3);
}

const files = (await fs.readdir(dir))
  .filter(f => f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg') || f.toLowerCase().endsWith('.webp'))
  .map(f => path.join(dir, f));

async function toDataUrl(filePath) {
  const buf = await fs.readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function callOpenAI(inputs) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: inputs
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${t}`);
  }
  return res.json();
}

const prompt = `You are a senior creative QA reviewer. Inspect each image and report ONLY:
- any text present (exactly as it appears)
- whether text is misspelled/garbled/low-legibility
- whether there are AI artifact issues (warped shapes, nonsense glyphs)
Return JSON array of {file, has_text, extracted_text, issues[]}.
Be strict. If unsure, flag it.`;

const inputs = [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }];

for (const f of files) {
  const dataUrl = await toDataUrl(f);
  inputs.push({
    role: 'user',
    content: [
      { type: 'input_text', text: `FILE: ${path.basename(f)}` },
      { type: 'input_image', image_url: dataUrl }
    ]
  });
}

const out = await callOpenAI(inputs);
const text = out.output_text || '';
console.log(text);
