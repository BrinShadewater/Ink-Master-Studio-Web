import JSZip from 'jszip';
import { migrateStudioJob } from './jobModel';
import { StudioJob } from '../types';

interface PortableManifest {
  format: 'inkmaster-job';
  schemaVersion: 1;
  job: Omit<StudioJob, 'sourceArtwork' | 'exports'> & {
    sourceArtwork: null | Omit<NonNullable<StudioJob['sourceArtwork']>, 'blob'> & { path: string };
    exports: Array<Omit<StudioJob['exports'][number], 'blob'> & { path: string }>;
  };
}

const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';

export const exportPortableJob = async (job: StudioJob): Promise<Blob> => {
  const zip = new JSZip();
  const sourcePath = job.sourceArtwork ? `source/${safeSegment(job.sourceArtwork.name)}` : null;
  if (sourcePath && job.sourceArtwork) zip.file(sourcePath, await job.sourceArtwork.blob.arrayBuffer());

  const exportEntries = await Promise.all(job.exports.map(async (entry, index) => {
    const path = `exports/${index + 1}-${safeSegment(entry.filename)}`;
    zip.file(path, await entry.blob.arrayBuffer());
    return {
      id: entry.id,
      filename: entry.filename,
      format: entry.format,
      timestamp: entry.timestamp,
      path,
    };
  }));

  const manifest: PortableManifest = {
    format: 'inkmaster-job',
    schemaVersion: 1,
    job: {
      ...job,
      sourceArtwork: job.sourceArtwork && sourcePath
        ? {
            name: job.sourceArtwork.name,
            type: job.sourceArtwork.type,
            lastModified: job.sourceArtwork.lastModified,
            path: sourcePath,
          }
        : null,
      exports: exportEntries,
    },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/x-inkmaster-job' });
};

export const importPortableJob = async (archive: Blob): Promise<StudioJob> => {
  try {
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('missing manifest');
    const parsed = JSON.parse(await manifestFile.async('string')) as PortableManifest;
    if (parsed.format !== 'inkmaster-job' || parsed.schemaVersion !== 1 || !parsed.job) {
      throw new Error('unsupported manifest');
    }
    const sourceMeta = parsed.job.sourceArtwork;
    const sourceFile = sourceMeta ? zip.file(sourceMeta.path) : null;
    const sourceArtwork = sourceMeta && sourceFile
      ? {
          name: sourceMeta.name,
          type: sourceMeta.type,
          lastModified: sourceMeta.lastModified,
          blob: new Blob([await sourceFile.async('uint8array')], { type: sourceMeta.type }),
        }
      : null;
    const exports = await Promise.all(parsed.job.exports.map(async (entry) => {
      const file = zip.file(entry.path);
      if (!file) throw new Error(`missing export ${entry.path}`);
      return {
        id: entry.id,
        filename: entry.filename,
        format: entry.format,
        timestamp: entry.timestamp,
        blob: new Blob([await file.async('uint8array')]),
      };
    }));
    return migrateStudioJob({ ...parsed.job, sourceArtwork, exports });
  } catch {
    throw new Error('Invalid Ink Master job file.');
  }
};
