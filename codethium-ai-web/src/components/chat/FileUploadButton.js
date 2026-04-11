import React, { useRef } from 'react';

const ACCEPTED_IMAGE = 'image/jpeg,image/png,image/gif,image/webp';
const ACCEPTED_FILE = '.pdf,.txt,.js,.ts,.py,.md,.json,.css,.html,.java,.c,.cpp,.go,.rs';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

/**
 * Props:
 *   onUploadComplete({ type, payload, name }) — called after successful upload
 *   onError(message) — called on upload failure
 *   disabled — bool
 */
function FileUploadButton({ onUploadComplete, onError, disabled }) {
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleUpload = async (file, endpoint) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${BASE_URL}/api/upload/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error || `Upload failed (${res.status})`);
        return;
      }
      onUploadComplete({ type: data.type, payload: data.payload, name: data.name });
    } catch (err) {
      onError(err.message);
    }
  };

  const btnStyle = {
    background: 'none',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.6)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '6px 10px',
    fontSize: '16px',
    lineHeight: 1,
    opacity: disabled ? 0.5 : 1,
    transition: 'color 0.2s, border-color 0.2s',
  };

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept={ACCEPTED_IMAGE}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files[0]) handleUpload(e.target.files[0], 'image');
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files[0]) handleUpload(e.target.files[0], 'file');
          e.target.value = '';
        }}
      />
      <button
        disabled={disabled}
        onClick={() => imageInputRef.current?.click()}
        title="Attach image"
        style={btnStyle}
      >
        🖼
      </button>
      <button
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        title="Attach file (PDF, code, text)"
        style={{ ...btnStyle, marginLeft: '4px' }}
      >
        📄
      </button>
    </>
  );
}

export default FileUploadButton;
