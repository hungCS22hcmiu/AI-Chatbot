import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText } from 'lucide-react';

function ImagePreview({ attachments, onRemove }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex gap-2 px-4 py-2 flex-wrap">
      <AnimatePresence>
        {attachments.map((att, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative w-[72px] h-[72px] rounded-lg overflow-hidden border border-white/10 bg-surface-2 flex-shrink-0 group"
          >
            {att.type === 'image' ? (
              <img
                src={att.payload}
                alt={att.name}
                className="w-full h-full object-cover block"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-1 gap-1">
                <FileText size={22} className="text-muted" />
                <span className="text-[10px] text-zinc-400 text-center truncate w-14">
                  {att.name}
                </span>
              </div>
            )}
            <button
              onClick={() => onRemove(i)}
              title="Remove"
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 border-none text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <X size={10} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ImagePreview;
