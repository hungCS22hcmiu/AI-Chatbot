import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import FileUploadButton from './FileUploadButton';
import ImagePreview from './ImagePreview';
import Spinner from '../ui/Spinner';

const MODELS = [
  { value: 'groq', label: 'Llama 3 (Groq)' },
  { value: 'openrouter', label: 'Llama 3 (OpenRouter)' },
  { value: 'local', label: 'CodeThium Local' },
  { value: 'gemini', label: 'Gemini 2.5 Flash (multimodal)' },
  { value: 'gemma', label: 'Gemma 4 31B (Google AI Studio)' },
];

const MULTIMODAL_MODELS = ['gemini', 'gemma'];

const MODEL_KEY = 'codethium_default_model';

function ChatInput({ onSend, isStreaming, disabled }) {
  const [content, setContent] = useState('');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) || 'groq');
  const [attachments, setAttachments] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const textareaRef = useRef(null);

  const prevModelRef = useRef(model);
  useEffect(() => {
    const hasMultimodal = attachments.some(a => a.type === 'image' || a.type === 'pdf');
    if (hasMultimodal && !MULTIMODAL_MODELS.includes(model)) {
      prevModelRef.current = model;
      setModel('gemini');
    } else if (!hasMultimodal && MULTIMODAL_MODELS.includes(model) && !MULTIMODAL_MODELS.includes(prevModelRef.current)) {
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

  const hasMultimodal = attachments.some(a => a.type === 'image' || a.type === 'pdf');
  const canSend = content.trim() && !isStreaming && !disabled;

  return (
    <div className="bg-surface-1 border-t border-white/10">
      <ImagePreview attachments={attachments} onRemove={handleRemoveAttachment} />

      {uploadError && (
        <p className="text-red-400 text-xs px-4 pt-1">{uploadError}</p>
      )}

      <div className="px-4 py-3 flex gap-2 items-end">
        {/* Model selector */}
        <select
          value={model}
          onChange={handleModelChange}
          disabled={isStreaming}
          title={hasMultimodal && !MULTIMODAL_MODELS.includes(model) ? 'Auto-switched to a multimodal model' : ''}
          className="bg-surface-2 text-zinc-300 border border-white/10 rounded-lg px-3 py-1.5 text-xs
            outline-none cursor-pointer flex-shrink-0
            disabled:opacity-60 disabled:cursor-not-allowed
            focus:border-brand-primary/50 transition-colors"
        >
          {MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* Upload buttons */}
        <FileUploadButton
          onUploadComplete={handleUploadComplete}
          onError={setUploadError}
          disabled={isStreaming || disabled}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none bg-surface-2 text-zinc-100 border border-white/10
            rounded-xl px-3 py-2 text-sm leading-relaxed outline-none overflow-hidden
            placeholder:text-zinc-500
            focus:border-brand-primary/50 transition-colors
            disabled:opacity-60"
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-from to-brand-via
            flex items-center justify-center flex-shrink-0
            disabled:opacity-40 disabled:cursor-not-allowed
            hover:opacity-90 transition-opacity"
        >
          {isStreaming ? <Spinner size={16} /> : <Send size={16} className="text-white" />}
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
