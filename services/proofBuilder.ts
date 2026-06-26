import { jsPDF } from 'jspdf';
import { PlacementMeasurement, StudioJob } from '../types';
import { PackageAsset } from './productionPackage';
import { resolveFilenamePattern } from './naming';

export const buildProofDescriptor = (
  job: StudioJob,
  placement: PlacementMeasurement,
) => {
  const productionProfile = {
    name: job.productionProfile.snapshot.name,
    revision: job.productionProfile.profileRevision,
    method: job.productionProfile.snapshot.method,
  };
  return {
    jobName: job.metadata.name,
    customerName: job.metadata.customerName || 'Customer',
    orderNumber: job.metadata.orderNumber || 'Not supplied',
    notes: job.metadata.notes || 'No production notes.',
    version: job.revision,
    productionProfile,
    productionProfileText: `Profile: ${productionProfile.name} · revision ${productionProfile.revision} · Method: ${productionProfile.method}`,
    placement: `${placement.widthInches}×${placement.heightInches} in · ${placement.presetId} · ${placement.garmentSize}`,
    approvalText: 'I approve the artwork, spelling, garment color, print size, and placement shown in this proof.',
  };
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Could not read proof image.'));
  reader.readAsDataURL(blob);
});

export const generateCustomerProof = async (
  job: StudioJob,
  mockups: PackageAsset[],
  quality: 'print' | 'email',
): Promise<{ blob: Blob; filename: string }> => {
  const placement = job.placements[job.activePlacementKey];
  const descriptor = buildProofDescriptor(job, placement);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: quality === 'email' });
  const accent = job.proofBranding.accentColor.replace('#', '');
  const r = Number.parseInt(accent.slice(0, 2), 16) || 99;
  const g = Number.parseInt(accent.slice(2, 4), 16) || 102;
  const b = Number.parseInt(accent.slice(4, 6), 16) || 241;

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 612, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(job.proofBranding.shopName || 'InkMaster Studio', 36, 32);
  doc.setFontSize(10);
  doc.text(quality === 'print' ? 'PRINT-READY CUSTOMER PROOF' : 'EMAIL CUSTOMER PROOF', 36, 52);

  doc.setTextColor(25, 30, 45);
  doc.setFontSize(16);
  doc.text(descriptor.jobName, 36, 102);
  doc.setFontSize(10);
  doc.text(`Customer: ${descriptor.customerName}`, 36, 122);
  doc.text(`Order: ${descriptor.orderNumber}`, 36, 138);
  doc.text(`Version: ${descriptor.version}`, 36, 154);
  doc.text(`Placement: ${descriptor.placement}`, 36, 170);
  doc.text(descriptor.productionProfileText, 36, 186);

  let y = 210;
  const imageWidth = mockups.length > 1 ? 250 : 500;
  const imageHeight = mockups.length > 1 ? 250 : 360;
  for (let index = 0; index < Math.min(mockups.length, 4); index += 1) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = mockups.length > 1 ? 36 + column * 270 : 56;
    const imageY = y + row * 265;
    try {
      doc.addImage(await blobToDataUrl(mockups[index].blob), 'PNG', x, imageY, imageWidth, imageHeight, undefined, quality === 'email' ? 'FAST' : 'MEDIUM');
    } catch {
      doc.setDrawColor(190);
      doc.rect(x, imageY, imageWidth, imageHeight);
      doc.text(mockups[index].filename, x + 10, imageY + 20);
    }
  }
  if (mockups.length > 0) y += mockups.length > 2 ? 530 : 270;

  doc.setFontSize(9);
  doc.setTextColor(70);
  doc.text(`Notes: ${descriptor.notes}`, 36, Math.min(690, y + 10), { maxWidth: 540 });
  doc.setDrawColor(120);
  doc.line(36, 726, 276, 726);
  doc.line(336, 726, 576, 726);
  doc.text('Customer signature', 36, 742);
  doc.text('Date', 336, 742);
  doc.setFontSize(7);
  doc.text(descriptor.approvalText, 36, 765, { maxWidth: 540 });
  doc.text(job.proofBranding.footerNote, 36, 782, { maxWidth: 540 });

  const baseName = resolveFilenamePattern(
    job.packageOptions.namingPattern,
    job,
    placement.presetId,
  );
  return {
    blob: doc.output('blob'),
    filename: `${baseName}_${quality}-proof.pdf`,
  };
};
