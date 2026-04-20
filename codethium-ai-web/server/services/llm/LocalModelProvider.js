const BaseLLMProvider = require('./BaseLLMProvider');
const config = require('../../config');
const formatLocalResponse = require('../formatLocalResponse');

// ---------------------------------------------------------------------------
// The local model is a tiny decoder-only transformer trained ONLY on Python
// coding problems in the format:
//   <BOS> # problem: {short lowercase description} <NL> {code} <EOS>
//
// Pipeline:
//   1. Call Groq to classify the user message.
//      - If it is general conversation / greeting  → Groq answers it directly.
//      - If it is a coding problem                 → Groq reformulates it into
//        a short lowercase description, then the local model generates the code.
//   2. RAG context (if any) is passed to Groq in both cases so it can use it.
// ---------------------------------------------------------------------------

const MAX_RAG_HINT_CHARS = 200;

/**
 * One Groq call that either:
 *   - Returns "CHAT: <natural answer>"  for greetings / general questions
 *   - Returns "CODE: <short lowercase problem description>"  for coding tasks
 *
 * @param {string} userMessage
 * @param {string} ragHint  — optional RAG context snippet
 * @returns {Promise<{type: 'chat'|'code', text: string}|null>}
 */
async function classifyWithGroq(userMessage, ragHint) {
  if (!config.GROQ_API_KEY) return null;

  const systemPrompt =
    'You assist a hybrid AI that has two modes:\n' +
    '  CHAT mode — for greetings, small talk, general questions, thanks, farewells.\n' +
    '  CODE mode — for any request to write, fix, explain, or generate code.\n\n' +
    'Your response MUST start with exactly one of these prefixes (no other text before it):\n' +
    '  CHAT: <your natural, friendly answer>\n' +
    '  CODE: <short lowercase Python problem description, max 15 words>\n\n' +
    'Rules:\n' +
    '- If the user says hi, hello, thanks, bye, or asks a general question → CHAT:\n' +
    '- If the user wants code written or a coding problem solved → CODE:\n' +
    '- For CODE, output ONLY the problem description — no explanation, no punctuation at end.\n' +
    '- For CHAT, answer naturally and helpfully. You may use the context hint below if relevant.';

  const userLine = ragHint
    ? `Context hint: ${ragHint}\n\nUser: ${userMessage}`
    : userMessage;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userLine },
        ],
        stream: false,
        max_tokens: 120,
        temperature: 0.2,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();

    if (raw.startsWith('CHAT:')) {
      return { type: 'chat', text: raw.slice(5).trim() };
    }
    if (raw.startsWith('CODE:')) {
      return { type: 'code', text: raw.slice(5).trim().toLowerCase() };
    }
    // Groq didn't follow the format — treat as chat answer
    return { type: 'chat', text: raw };
  } catch {
    return null;
  }
}

/**
 * Ask Groq to verify whether `generatedCode` satisfies `requirement`.
 * If not, Groq returns corrected code.
 *
 * Groq must respond with either:
 *   PASS           — code is correct, use as-is
 *   FIX: <code>    — code is wrong; use the corrected version after "FIX:"
 *
 * Falls back to the original code if Groq is unavailable.
 *
 * @param {string} requirement   — original user message
 * @param {string} generatedCode — raw output from the local model
 * @returns {Promise<string>}
 */
async function verifyAndFixWithGroq(requirement, generatedCode) {
  if (!config.GROQ_API_KEY) return generatedCode;

  const systemPrompt =
    'You are a Python code reviewer for a small AI model that generates code.\n' +
    'You will receive:\n' +
    '  REQUIREMENT: what the user asked for\n' +
    '  GENERATED CODE: what the model produced\n\n' +
    'Decide if the generated code correctly and completely satisfies the requirement.\n\n' +
    'If it is correct → respond with exactly: PASS\n' +
    'If it is wrong, incomplete, or broken → respond with: FIX:\n' +
    'followed immediately by the corrected Python code only (no extra explanation).\n\n' +
    'Be strict: missing logic, syntax errors, or wrong behaviour → FIX:';

  const userLine =
    `REQUIREMENT: ${requirement}\n\nGENERATED CODE:\n${generatedCode}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userLine },
        ],
        stream: false,
        max_tokens: 600,
        temperature: 0.1,
      }),
    });
    if (!res.ok) return generatedCode;
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();

    if (raw.startsWith('PASS')) return generatedCode;
    if (raw.startsWith('FIX:')) return raw.slice(4).trim();
    return generatedCode;
  } catch {
    return generatedCode;
  }
}

/**
 * Pull the last user message and strip RAG context out of the messages array.
 */
function extractLocalContext(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  const userMessage = (userMessages[userMessages.length - 1]?.content || '').trim();

  const ragHint = messages
    .filter(m => m.role === 'system')
    .map(m =>
      m.content
        .replace(/^The following excerpts.*?question\.\s*/i, '')
        .replace(/^Relevant context from uploaded documents:\s*/i, '')
        .replace(/\[Source:[^\]]*\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_RAG_HINT_CHARS);

  return { userMessage, ragHint };
}

class LocalModelProvider extends BaseLLMProvider {
  getModelName() {
    return 'codethium-local';
  }

  async chat(messages) {
    const chunks = [];
    for await (const chunk of this.chatStream(messages)) {
      chunks.push(chunk);
    }
    return chunks.join('');
  }

  async *chatStream(messages) {
    const { userMessage, ragHint } = extractLocalContext(messages);

    // Step 1 — Classify with Groq
    const classified = await classifyWithGroq(userMessage, ragHint);

    // Step 2a — General chat: Groq answers directly, local model not used
    if (!classified || classified.type === 'chat') {
      yield classified ? classified.text : userMessage;
      return;
    }

    // Step 2b — Coding problem: send clean description to local model
    // decoder_only_model.py wraps it as: "<BOS> # problem: {message} <NL> "
    const description = classified.text.slice(0, 150);
    const message = ragHint
      ? `context: ${ragHint.slice(0, 100)} | ${description}`
      : description;

    const res = await fetch(`${config.LOCAL_MODEL_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Local model error ${res.status}: ${text}`);
    }
    const data = await res.json();
    const rawCode = formatLocalResponse(data.reply);

    // Step 3 — Verify output satisfies the requirement; Groq fixes it if not
    const finalCode = await verifyAndFixWithGroq(userMessage, rawCode);

    yield finalCode;
  }
}

module.exports = LocalModelProvider;
