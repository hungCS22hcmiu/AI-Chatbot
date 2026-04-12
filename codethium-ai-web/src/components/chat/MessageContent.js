import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function MessageContent({ content }) {
  return (
    <ReactMarkdown
      className="prose prose-invert prose-sm max-w-none
        prose-p:my-1
        prose-a:text-brand-accent
        prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5"
      remarkPlugins={[remarkGfm]}
      components={{
        code({ inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          if (!inline && match) {
            return (
              <div className="rounded-lg overflow-hidden text-sm my-2">
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: 0, borderRadius: 0 }}
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            );
          }
          return (
            <code
              className="bg-surface-3 px-1.5 py-0.5 rounded text-brand-accent text-xs font-mono"
              {...props}
            >
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
