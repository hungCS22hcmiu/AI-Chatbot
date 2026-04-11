import React, { useState, useRef, useEffect } from 'react';
import FileUploadButton from './FileUploadButton';
import ImagePreview from './ImagePreview';

const MODELS = [
  { value: 'groq', label: 'Llama 3 (Groq)' },
  { value: 'openrouter', label: 'Llama 3 (OpenRouter)' },
  { value: 'local', label: 'CodeThium Local' },
  { value: 'gemini', label: 'Gemini 2.5 Flash (multimodal)' },
];

const MODEL_KEY = 'codethium_default_model';

function ChatInput({ onSend, isStreaming, disabled }) {
  const [content, setContent] = useState('');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) || 'groq');
  const [attachments, setAttachments] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const textareaRef = useRef(null);

  // Auto-switch to Gemini when attachments present; restore previous model when cleared
  const prevModelRef = useRef(model);
  useEffect(() => {
    const hasMultimodal = attachments.some(a => a.type === 'image' || a.type === 'pdf');
    if (hasMultimodal && model !== 'gemini') {
      prevModelRef.current = model;
      setModel('gemini');
    } else if (!hasMultimodal && model === 'gemini' && prevModelRef.current !== 'gemini') {
      setModel(prevModelRef.current);
    }
  }, [attachments]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModelChange = (e) => {
    const val = e.target.value;
    setModel(val);
    localStorage.setItem(MODEL_KEY, val);
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [content]);

  const handleSend = () => {
    const trimmed = content.trim();
    if (!trimmed || isStreaming) return;
    onSend({ content: trimmed, model, attachments });
    setContent('');
    setAttachments([]);
    setUploadError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUploadComplete = (attachment) => {
    setUploadError('');
    setAttachments(prev => [...prev, attachment]);
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div style={{ background: '#13131f', borderTop: '1px solid #2a2a3e' }}>
      <ImagePreview attachments={attachments} onRemove={handleRemoveAttachment} />

      {uploadError && (
        <div style={{
          color: '#ff6b6b',
          fontSize: '12px',
          padding: '4px 16px 0',
        }}>
          {uploadError}
        </div>
      )}

      <div style={{
        padding: '12px 16px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
      }}>
        <select
          value={model}
          onChange={handleModelChange}
          disabled={isStreaming || attachments.some(a => a.type === 'image' || a.type === 'pdf')}
          title={attachments.some(a => a.type === 'image' || a.type === 'pdf') ? 'Auto-switched to Gemini for multimodal' : ''}
          style={{
            background: '#1e1e2e',
            color: '#ccc',
            border: '1px solid #2a2a3e',
            borderRadius: '8px',
            padding: '8px',
            fontSize: '13px',
            cursor: isStreaming || attachments.some(a => a.type === 'image' || a.type === 'pdf') ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        <FileUploadButton
          onUploadComplete={handleUploadComplete}
          onError={setUploadError}
          disabled={isStreaming || disabled}
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          placeholder="Ask anything... (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: '#1e1e2e',
            color: '#fff',
            border: '1px solid #2a2a3e',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '14px',
            lineHeight: '1.5',
            outline: 'none',
            overflow: 'hidden',
          }}
        />

        <button
          onClick={handleSend}
          disabled={!content.trim() || isStreaming || disabled}
          style={{
            background: isStreaming ? '#555' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            cursor: isStreaming ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            flexShrink: 0,
          }}
        >
          {isStreaming ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
