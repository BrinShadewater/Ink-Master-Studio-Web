import React, { useCallback } from 'react';
import { MAX_FILE_SIZE_MB, MAX_SVG_SIZE_MB } from '../constants';

interface DropzoneProps {
  onFileAccepted: (file: File) => void;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileAccepted }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        validateAndAccept(e.dataTransfer.files[0]);
      }
    },
    [onFileAccepted]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAccept(e.target.files[0]);
    }
  };

  const validateAndAccept = (file: File) => {
    const isSvg = file.type === 'image/svg+xml';
    const maxSize = isSvg ? MAX_SVG_SIZE_MB : MAX_FILE_SIZE_MB;
    
    if (file.size > maxSize * 1024 * 1024) {
      alert(`File too large. Max size is ${maxSize}MB.`);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload JPG, PNG, or SVG.');
      return;
    }

    onFileAccepted(file);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="border-2 border-dashed border-slate-700 rounded-xl p-16 text-center hover:border-indigo-500 hover:bg-slate-900/50 transition-all cursor-pointer group bg-slate-900/20"
    >
      <input
        type="file"
        id="fileInput"
        className="hidden"
        accept=".jpg,.jpeg,.png,.svg,.webp"
        onChange={handleFileInput}
      />
      <label htmlFor="fileInput" className="cursor-pointer block">
        <div className="mb-6 transform group-hover:scale-110 transition-transform duration-300">
            <svg className="w-16 h-16 mx-auto text-slate-600 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-200 mb-2">Drop artwork here</h3>
        <p className="text-slate-500 text-sm mb-6">
          JPG, PNG, SVG up to {MAX_FILE_SIZE_MB}MB
        </p>
        <div className="px-8 py-3 bg-slate-800 text-slate-200 rounded-lg inline-block group-hover:bg-indigo-600 group-hover:text-white transition-all text-sm font-semibold shadow-lg">
          Or Select File
        </div>
      </label>
    </div>
  );
};