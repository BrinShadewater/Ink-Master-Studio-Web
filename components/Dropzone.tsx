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

  const validateAndAccept = async (file: File) => {
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

    // Additional SVG security check
    if (isSvg) {
      const text = await file.text();
      if (/<script/i.test(text) || /on\w+=/i.test(text)) {
        alert('SVG file contains potentially unsafe content.');
        return;
      }
    }

    onFileAccepted(file);
  };

  return (
    <section aria-labelledby="upload-artwork-title" className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 shadow-2xl shadow-black/30">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="group cursor-pointer border-2 border-dashed border-slate-700 bg-slate-900/20 p-8 text-center transition-all hover:border-indigo-500 hover:bg-slate-900/50 sm:p-12"
      >
        <input
          type="file"
          id="fileInput"
          className="hidden"
          accept=".jpg,.jpeg,.png,.svg,.webp"
          onChange={handleFileInput}
        />
        <label htmlFor="fileInput" className="block cursor-pointer">
          <div className="mb-6 transform transition-transform duration-300 group-hover:scale-110">
              <svg className="mx-auto h-16 w-16 text-slate-600 transition-colors group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
          </div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300">Start a print-ready file</p>
          <h2 id="upload-artwork-title" className="mb-2 text-2xl font-black text-slate-100">Drop artwork here</h2>
          <p className="mb-6 text-sm text-slate-500">
            JPG, PNG, or WebP up to {MAX_FILE_SIZE_MB}MB · safe SVG up to {MAX_SVG_SIZE_MB}MB
          </p>
          <div className="inline-block rounded-lg bg-slate-800 px-8 py-3 text-sm font-semibold text-slate-200 shadow-lg transition-all group-hover:bg-indigo-600 group-hover:text-white">
            Select artwork
          </div>
        </label>
      </div>

      <div className="grid gap-px bg-slate-800 text-left sm:grid-cols-3">
        <div className="bg-slate-950/95 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">1 · Drop</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">Keeps your artwork local and prepares a working copy.</p>
        </div>
        <div className="bg-slate-950/95 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">2 · Product</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">Pick a Printify preset with the right pixel size and DPI.</p>
        </div>
        <div className="bg-slate-950/95 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">3 · Download</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">Save a compliant PNG without technical jargon.</p>
        </div>
      </div>
    </section>
  );
};
