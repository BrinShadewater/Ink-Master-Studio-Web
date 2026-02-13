import React, { useState, useCallback } from 'react';
import { ProcessingSettings, BatchJob, OutputFormat } from '../types';
import { fileToBase64, processImage, getPrintDPI } from '../services/imageProcessing';
import { Dropzone } from './Dropzone';

interface BatchProcessorProps {
  onClose: () => void;
  defaultSettings: ProcessingSettings;
}

export const BatchProcessor: React.FC<BatchProcessorProps> = ({ onClose, defaultSettings }) => {
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const addFiles = async (files: File[]) => {
    const newJobs: BatchJob[] = [];
    for (const file of files) {
      try {
        const base64 = await fileToBase64(file);
        const dataUrl = `data:${file.type};base64,${base64}`;
        
        // Calculate DPI
        const img = new Image();
        await new Promise((resolve) => { img.onload = resolve; img.src = dataUrl; });
        const dpiInfo = getPrintDPI(img.naturalWidth, img.naturalHeight);

        newJobs.push({
          id: Math.random().toString(36).substr(2, 9),
          file,
          previewUrl: dataUrl,
          settings: { ...defaultSettings },
          status: 'pending',
          resultUrl: null,
          resultBlob: null,
          dpiInfo
        });
      } catch (e) {
        console.error('Failed to load file', file.name, e);
      }
    }
    setJobs(prev => [...prev, ...newJobs]);
  };

  const handleJobSettingChange = (id: string, updates: Partial<ProcessingSettings>) => {
    setJobs(prev => prev.map(job => 
      job.id === id ? { ...job, settings: { ...job.settings, ...updates } } : job
    ));
  };

  const processJob = async (job: BatchJob) => {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing' } : j));
    try {
      const result = await processImage(job.previewUrl, job.settings);
      setJobs(prev => prev.map(j => j.id === job.id ? {
        ...j,
        status: 'done',
        resultUrl: result.url,
        resultBlob: result.blob
      } : j));
    } catch (e) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error' } : j));
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    for (const job of jobs) {
      if (job.status === 'pending' || job.status === 'error') {
        await processJob(job);
      }
    }
    setIsProcessingAll(false);
  };

  const downloadAll = async () => {
    const completedJobs = jobs.filter(j => j.status === 'done' && j.resultBlob);
    if (completedJobs.length === 0) return;

    setDownloadProgress(10);
    try {
        // @ts-ignore
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();

        completedJobs.forEach((job) => {
            const ext = job.settings.format === OutputFormat.JPG ? 'jpg' : job.settings.format === OutputFormat.SVG ? 'svg' : 'png';
            const name = job.file.name.substring(0, job.file.name.lastIndexOf('.')) || job.file.name;
            if (job.resultBlob) {
                zip.file(`${name}_processed.${ext}`, job.resultBlob);
            }
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'inkmaster_batch_export.zip';
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        // Fallback
        for (let i = 0; i < completedJobs.length; i++) {
            const job = completedJobs[i];
            const a = document.createElement('a');
            if (job.resultUrl) {
                a.href = job.resultUrl;
                const ext = job.settings.format === OutputFormat.JPG ? 'jpg' : job.settings.format === OutputFormat.SVG ? 'svg' : 'png';
                const name = job.file.name.substring(0, job.file.name.lastIndexOf('.')) || job.file.name;
                a.download = `${name}_processed.${ext}`;
                a.click();
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }
    setDownloadProgress(0);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Batch Processor
            </h2>
            <p className="text-slate-500 text-sm mt-1">Queued Jobs: {jobs.length}</p>
        </div>
        <div className="flex gap-4">
          <button onClick={processAll} disabled={isProcessingAll || jobs.length === 0} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-bold transition-all">
            {isProcessingAll ? 'Processing...' : 'Process All'}
          </button>
          <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-bold transition-all">Close</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-900/50 rounded-2xl border border-slate-800 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
             {/* Mini Dropzone */}
            <div className="border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center p-8 hover:bg-slate-800/50 transition-colors cursor-pointer text-slate-500 hover:text-indigo-400 hover:border-indigo-500/50 min-h-[300px]"
                 onClick={() => document.getElementById('batchFileInput')?.click()}
            >
                <input 
                    type="file" 
                    id="batchFileInput" 
                    multiple 
                    className="hidden" 
                    accept=".jpg,.jpeg,.png,.svg,.webp"
                    onChange={(e) => {
                        if (e.target.files) addFiles(Array.from(e.target.files));
                    }}
                />
                <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span className="font-bold">Add Files</span>
            </div>

            {jobs.map(job => (
                <div key={job.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 shadow-lg relative overflow-hidden group">
                     {job.status === 'processing' && (
                         <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500 animate-pulse"></div>
                     )}
                     {job.status === 'done' && (
                         <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded-bl font-bold">DONE</div>
                     )}
                     
                     <div className="flex gap-3">
                         <div className="w-16 h-16 bg-slate-800 rounded-lg overflow-hidden border border-slate-700 flex-shrink-0">
                             <img src={job.previewUrl} className="w-full h-full object-cover" />
                         </div>
                         <div className="flex-1 min-w-0">
                             <p className="text-sm font-bold text-slate-200 truncate" title={job.file.name}>{job.file.name}</p>
                             <div className="flex gap-1 mt-1">
                                {job.dpiInfo && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                        job.dpiInfo.status === 'good' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' :
                                        job.dpiInfo.status === 'low' ? 'bg-amber-900/30 text-amber-400 border-amber-500/30' :
                                        'bg-red-900/30 text-red-400 border-red-500/30'
                                    }`}>
                                        {job.dpiInfo.dpi} DPI
                                    </span>
                                )}
                             </div>
                         </div>
                     </div>

                     <div className="space-y-2 pt-2 border-t border-slate-800">
                        {/* Compact Settings */}
                         <div className="flex gap-1">
                             {['NONE', 'BLACK', 'WHITE'].map(c => (
                                 <button 
                                    key={c}
                                    onClick={() => handleJobSettingChange(job.id, { shirtColor: c as any })}
                                    className={`flex-1 text-[9px] py-1 rounded border ${
                                        job.settings.shirtColor === c 
                                        ? 'bg-indigo-600 border-indigo-500 text-white' 
                                        : 'bg-slate-800 border-slate-700 text-slate-500'
                                    }`}
                                 >
                                     {c.charAt(0)}
                                 </button>
                             ))}
                         </div>
                         <div className="flex items-center gap-2">
                             <span className="text-[10px] text-slate-500 w-8">Thr</span>
                             <input type="range" min="0" max="100" value={job.settings.threshold} 
                                onChange={(e) => handleJobSettingChange(job.id, { threshold: parseInt(e.target.value) })}
                                className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                             />
                         </div>
                     </div>

                     <div className="mt-auto flex gap-2">
                        <button 
                            onClick={() => processJob(job)}
                            disabled={job.status === 'processing'}
                            className="flex-1 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-colors"
                        >
                            {job.status === 'done' ? 'Reprocess' : 'Process'}
                        </button>
                        {job.status === 'done' && (
                            <a 
                                href={job.resultUrl!} 
                                download={`${job.file.name}_processed`}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/50 text-emerald-400 text-xs hover:bg-emerald-600 hover:text-white transition-colors"
                            >
                                ↓
                            </a>
                        )}
                     </div>
                </div>
            ))}
        </div>
      </div>

      <div className="flex justify-end">
          <button 
            onClick={downloadAll} 
            disabled={!jobs.some(j => j.status === 'done')}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-8 py-4 rounded-xl font-bold shadow-xl flex items-center gap-3"
          >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
             {downloadProgress > 0 ? `Zipping...` : 'Download All as ZIP'}
          </button>
      </div>
    </div>
  );
};