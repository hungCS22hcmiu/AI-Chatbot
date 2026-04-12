const pdfParse = require('pdf-parse');

const MAX_CHARS = 8000;

const TEXT_MIMETYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/x-python',
  'text/javascript',
  'application/javascript',
  'application/json',
  'text/css',
  'text/html',
  'text/typescript',
  'text/x-java-source',
]);

/**
 * Extract text content from an uploaded file buffer.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>} extracted text, truncated to MAX_CHARS
 */
async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text.slice(0, MAX_CHARS);
  }
  if (mimetype.startsWith('text/') || TEXT_MIMETYPES.has(mimetype)) {
    return buffer.toString('utf8').slice(0, MAX_CHARS);
  }
  const err = new Error('Unsupported file type');
  err.status = 415;
  throw err;
}

/**
 * Extract full text without truncation — used for RAG document storage.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
async function extractFullText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (mimetype.startsWith('text/') || TEXT_MIMETYPES.has(mimetype)) {
    return buffer.toString('utf8');
  }
  const err = new Error('Unsupported file type');
  err.status = 415;
  throw err;
}

module.exports = { extractText, extractFullText };
