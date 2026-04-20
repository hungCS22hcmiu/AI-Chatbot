import React, { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ---------- CodeBlock Component (Fixed) ----------
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const textToCopy = String(code);

    try {
      // Modern Clipboard API
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
    } catch (err) {
      // Fallback for older browsers or permission issues
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setCopied(true);
        } else {
          console.error('Fallback copy failed');
        }
      } catch (fallbackErr) {
        console.error('Fallback copy error:', fallbackErr);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }, [code]);

  // Reset copied state after 2 seconds with cleanup
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  return (
    <div className="rounded-lg overflow-hidden text-sm my-2 border border-white/10 bg-[#111827]">
      <div className="flex items-center justify-between px-3 py-2 bg-black/30 border-b border-white/10">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="relative z-10 inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white cursor-pointer select-none"
          aria-label="Copy code to clipboard"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, background: 'transparent' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ---------- MessageContent Component (Improved) ----------
function MessageContent({ content }) {
  return (
    <ReactMarkdown
      className="prose prose-invert prose-sm max-w-none
        prose-p:my-1
        prose-a:text-brand-accent
        prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5"
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          return <>{children}</>;
        },
        code({ inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');

          // Block code: not inline AND (has language tag OR contains newlines)
          if (!inline && (match || codeString.includes('\n'))) {
            return <CodeBlock language={match?.[1] || ''} code={codeString} />;
          }

          // Inline code
          return (
            <code className="bg-surface-3 px-1.5 py-0.5 rounded text-brand-accent text-xs font-mono">
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export default MessageContent;