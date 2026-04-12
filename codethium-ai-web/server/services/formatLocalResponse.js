const CODE_START_RE = /(?:^|\s)(class \w|def \w|import \w|from \w+ import)/;
const BLOCK_KW_RE = /^(class |def |if |elif |else:|for |while |try:|except |except:|finally:|with )/;
const DEDENT_KW_RE = /^(return |return$|pass$|break$|continue$|raise )/;

function processIndentTokens(text) {
  let indent = 0;
  let result = '';
  let hadTokens = false;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('<INDENT>', i)) {
      indent++; hadTokens = true; i += 7;
    } else if (text.startsWith('<DEDENT>', i)) {
      indent = Math.max(0, indent - 1); hadTokens = true; i += 7;
    } else if (text[i] === '\n') {
      result += '\n' + '    '.repeat(indent); i++;
    } else {
      result += text[i];
    }
  }
  return { text: result, hadTokens };
}

function splitToLines(code) {
  const flat = code.replace(/\s+/g, ' ').trim();
  const result = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);

    if (depth > 0) { current += ch; continue; }

    if (ch === ' ') {
      const rest = flat.slice(i + 1);

      if (BLOCK_KW_RE.test(rest) || DEDENT_KW_RE.test(rest)) {
        if (current.trim()) result.push(current.trim());
        current = '';
        continue;
      }

      if (/^self\.\w+\s*=/.test(rest)) {
        if (current.trim() && !/[:=]\s*$/.test(current.trim())) {
          result.push(current.trim());
          current = '';
          continue;
        }
      }

      if (/^\w+\s*=\s/.test(rest) && !/[=<>!]=?$/.test(current.trim()) && current.trim().length > 0) {
        const varMatch = rest.match(/^(\w+)\s*=/);
        if (varMatch && !['in', 'is', 'and', 'or', 'not'].includes(varMatch[1])) {
          const prev = current.trim();
          if (!prev.endsWith('=') && !prev.endsWith(',') && !prev.endsWith('(') && !prev.endsWith(':')) {
            result.push(prev);
            current = '';
            continue;
          }
        }
      }
    }

    if (ch === ':' && depth === 0 && i + 1 < flat.length && flat[i + 1] === ' ') {
      const rest = flat.slice(i + 2).trimStart();
      if (BLOCK_KW_RE.test(rest) || DEDENT_KW_RE.test(rest) ||
          /^self\.\w+\s*=/.test(rest) || /^[a-z_]\w*\s*=\s/.test(rest)) {
        current += ':';
        result.push(current.trim());
        current = '';
        i++;
        continue;
      }
    }

    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function findEnclosingClassIndent(formatted) {
  for (let i = formatted.length - 1; i >= 0; i--) {
    const m = formatted[i].match(/^(\s*)class /);
    if (m) return Math.floor(m[1].length / 4);
  }
  return null;
}

function applyIndentation(lines) {
  const result = [];
  let indent = 0;
  let pendingIndent = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isClass = line.startsWith('class ');
    const isDef = line.startsWith('def ');
    const isBlock = BLOCK_KW_RE.test(line);
    const isDedent = DEDENT_KW_RE.test(line);
    const endsColon = /:\s*$/.test(line);

    if (isClass) {
      indent = 0;
      pendingIndent = false;
    } else if (isDef) {
      const ci = findEnclosingClassIndent(result);
      indent = ci !== null ? ci + 1 : 0;
      pendingIndent = false;
    } else if (pendingIndent) {
      indent++;
      pendingIndent = false;
    }

    result.push('    '.repeat(indent) + line);

    if (endsColon && (isBlock || isClass || isDef)) {
      pendingIndent = true;
    } else if (isDedent) {
      indent = Math.max(0, indent - 1);
    }
  }
  return result;
}

function formatLocalResponse(raw) {
  if (!raw || typeof raw !== 'string') return raw;

  let text = raw.replace(/:<br\s*\/?>/gi, '\n');
  const { text: processed } = processIndentTokens(text);
  text = processed;

  if (!CODE_START_RE.test(text)) return text;

  const codeMatch = text.match(CODE_START_RE);
  let preamble = '';
  let code = text;
  if (codeMatch && codeMatch.index > 0) {
    preamble = text.slice(0, codeMatch.index).trim();
    code = text.slice(codeMatch.index).trim();
  }

  const lines = splitToLines(code);
  const formatted = applyIndentation(lines);

  let result = '';
  if (preamble) result += preamble + '\n\n';
  result += '```python\n' + formatted.join('\n') + '\n```';
  return result;
}

module.exports = formatLocalResponse;
