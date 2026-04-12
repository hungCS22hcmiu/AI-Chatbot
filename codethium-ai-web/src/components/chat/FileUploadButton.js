import React, { useRef } from 'react';
import { ImageIcon, Paperclip } from 'lucide-react';
import Button from '../ui/Button';

const ACCEPTED_IMAGE = 'image/jpeg,image/png,image/gif,image/webp';
const ACCEPTED_FILE = '.pdf,.txt,.js,.ts,.py,.md,.json,.css,.html,.java,.c,.cpp,.go,.rs';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

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

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept={ACCEPTED_IMAGE}
        className="hidden"
        onChange={(e) => {
          if (e.target.files[0]) handleUpload(e.target.files[0], 'image');
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE}
        className="hidden"
        onChange={(e) => {
          if (e.target.files[0]) handleUpload(e.target.files[0], 'file');
          e.target.value = '';
        }}
      />
      <Button
        variant="icon"
        disabled={disabled}
        onClick={() => imageInputRef.current?.click()}
        title="Attach image"
      >
        <ImageIcon size={17} />
      </Button>
      <Button
        variant="icon"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        title="Attach file (PDF, code, text)"
      >
        <Paperclip size={17} />
      </Button>
    </>
  );
}

export default FileUploadButton;
