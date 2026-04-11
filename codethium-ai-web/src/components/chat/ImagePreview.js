import React from 'react';

/**
 * Renders a strip of attachment previews above the chat input.
 * Props:
 *   attachments: [{ type, payload, name }]
 *   onRemove(index) — remove an attachment by index
 */
function ImagePreview({ attachments, onRemove }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      padding: '8px 16px 0',
      flexWrap: 'wrap',
    }}>
      {attachments.map((att, i) => (
        <div
          key={i}
          style={{
            position: 'relative',
            width: '72px',
            height: '72px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.15)',
            background: '#1e1e2e',
            flexShrink: 0,
          }}
        >
          {att.type === 'image' ? (
            <img
              src={att.payload}
              alt={att.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              boxSizing: 'border-box',
            }}>
              <span style={{ fontSize: '22px' }}>📄</span>
              <span style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.6)',
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '64px',
                marginTop: '4px',
              }}>{att.name}</span>
            </div>
          )}
          <button
            onClick={() => onRemove(i)}
            title="Remove"
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '18px',
              height: '18px',
              background: 'rgba(0,0,0,0.7)',
              border: 'none',
              color: '#fff',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default ImagePreview;
