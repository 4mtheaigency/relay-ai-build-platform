/**
 * Parses Claude's markdown output into individual named files.
 *
 * Handles the formats Claude consistently uses:
 *   ### N. Enhanced filename.ext
 *   ### N. Description (path/to/file.ext)
 *   // filename: path/to/file.ext  (inside a code block)
 *   ## path/to/file.ext
 */

const LANG_DEFAULTS = {
  javascript: 'index.js',
  js:         'index.js',
  typescript: 'index.ts',
  ts:         'index.ts',
  json:       'data.json',
  html:       'index.html',
  css:        'styles.css',
  python:     'main.py',
  dockerfile: 'Dockerfile',
  yaml:       'config.yml',
  yml:        'config.yml',
  bash:       'run.sh',
  sh:         'run.sh',
  sql:        'schema.sql',
};

function extractFilenameFromHeader(header) {
  // Format: ### N. Description (path/to/file.ext)
  const parenMatch = header.match(/\(([^)]+\.[a-zA-Z0-9]+)\)\s*$/);
  if (parenMatch) return parenMatch[1].trim();

  // Format: ### N. Enhanced path/to/file.ext  (last token looks like a filename)
  const words = header.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim().split(/\s+/);
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (/^[\w./\-]+\.[a-zA-Z0-9]{1,6}$/.test(w)) return w;
  }
  return null;
}

function extractInlineFilename(firstLine) {
  // // filename: path/to/file.ext
  const m = firstLine.match(/\/\/\s*filename:\s*(.+)/i)
         || firstLine.match(/#\s*filename:\s*(.+)/i)
         || firstLine.match(/<!--\s*filename:\s*(.+?)\s*-->/i);
  return m ? m[1].trim() : null;
}

/**
 * Parse markdown text into an array of { path, content, language } objects.
 */
function parseFiles(markdown) {
  const lines = markdown.split('\n');
  const files = [];
  const seen = new Set();

  let i = 0;
  let pendingHeader = null;

  while (i < lines.length) {
    const line = lines[i];

    // Capture section headers  (##, ###, ####)
    if (/^#{2,4}\s/.test(line)) {
      pendingHeader = line;
      i++;
      continue;
    }

    // Detect opening fence
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      const lang = fenceMatch[1].toLowerCase();
      i++;
      const codeLines = [];

      // Collect until closing fence
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence

      if (codeLines.length === 0) {
        pendingHeader = null;
        continue;
      }

      // Determine filename
      let filename = null;

      // 1. Inline comment on first line of block
      const inlineFile = extractInlineFilename(codeLines[0]);
      if (inlineFile) {
        filename = inlineFile;
        // Remove the comment line from content
        codeLines.shift();
      }

      // 2. Preceding markdown header
      if (!filename && pendingHeader) {
        filename = extractFilenameFromHeader(pendingHeader);
      }

      // 3. Language default
      if (!filename) {
        filename = LANG_DEFAULTS[lang] || (lang ? `file.${lang}` : 'output.txt');
      }

      const content = codeLines.join('\n').trimEnd();
      if (!content) {
        pendingHeader = null;
        continue;
      }

      // De-duplicate: if we've seen this filename, append a counter
      let finalPath = filename;
      if (seen.has(finalPath)) {
        const ext = finalPath.includes('.')
          ? '.' + finalPath.split('.').pop()
          : '';
        const base = finalPath.slice(0, finalPath.length - ext.length);
        let n = 2;
        while (seen.has(`${base}_${n}${ext}`)) n++;
        finalPath = `${base}_${n}${ext}`;
      }
      seen.add(finalPath);

      files.push({ path: finalPath, content, language: lang });
      pendingHeader = null;
      continue;
    }

    i++;
  }

  return files;
}

module.exports = { parseFiles };
