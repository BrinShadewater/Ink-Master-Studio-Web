import React from 'react';
import { ProductionPackageReview as ProductionPackageReviewModel } from '../services/packageReview';

interface ProductionPackageReviewProps {
  review: ProductionPackageReviewModel;
}

const statusClass: Record<string, string> = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  missing: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  excluded: 'border-slate-700 bg-slate-950/50 text-slate-500',
};

const statusLabel: Record<string, string> = {
  ready: 'Ready',
  missing: 'Missing',
  excluded: 'Off',
};

export const ProductionPackageReview: React.FC<ProductionPackageReviewProps> = ({ review }) => (
  <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Package review</p>
        <h3 className="mt-1 truncate font-mono text-xs font-black text-white">{review.packageFilename}</h3>
        <p className={`mt-2 text-xs font-bold ${review.canExport ? 'text-emerald-300' : review.gateStatus === 'blocked' ? 'text-rose-300' : 'text-amber-300'}`}>
          {review.statusText}
        </p>
      </div>
      <span className={`flex-none rounded-full px-2 py-1 text-[10px] font-black ${review.canExport ? 'bg-emerald-500/20 text-emerald-200' : review.gateStatus === 'blocked' ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/20 text-amber-200'}`}>
        {review.canExport ? 'READY' : review.gateStatus === 'blocked' ? 'BLOCKED' : 'ACK NEEDED'}
      </span>
    </div>

    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Applied production profile</p>
      <p className="mt-1 text-xs text-slate-200">
        {review.profile.name} · revision {review.profile.revision}
        {review.profile.status !== 'current' && <span className="text-amber-300"> · {review.profile.status.replace('-', ' ')}</span>}
      </p>
    </div>

    {(review.blockingReasons.length > 0 || review.warnings.length > 0) && (
      <div className="mt-3 space-y-2">
        {review.blockingReasons.map((reason) => (
          <p key={reason} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-200">{reason}</p>
        ))}
        {review.warnings.map((warning) => (
          <p key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">{warning}</p>
        ))}
      </div>
    )}

    <div className="mt-3 space-y-2">
      {review.items.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-200">{entry.label}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{entry.filename}</p>
            </div>
            <span className={`flex-none rounded-full border px-2 py-0.5 text-[9px] font-black ${statusClass[entry.status]}`}>
              {statusLabel[entry.status]}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{entry.note}</p>
        </div>
      ))}
    </div>
  </section>
);
