import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import type { TShirtProductVariant } from './productModel';
import type { TShirtExportPresetId } from './tshirtExportModel';

export interface ListingKitMockup {
  color: string;
  scene: string;
  blob: Blob;
}

export interface ListingKitInput {
  projectName: string;
  artworkName: string;
  product: TShirtProductVariant;
  presetId: TShirtExportPresetId;
  printFile: Blob;
  mockups: ListingKitMockup[];
}

const safeName = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'inkmaster-design';

export const createListingKitManifest = (input: Omit<ListingKitInput, 'printFile' | 'mockups'> & {
  mockups: Array<Pick<ListingKitMockup, 'color' | 'scene'>>;
}) => ({
  format: 'inkmaster-listing-kit',
  project: input.projectName,
  artwork: input.artworkName,
  garment: 'Classic tee',
  printMethod: input.product.printMethod,
  exportPreset: input.presetId,
  placement: input.product.placement,
  mockups: input.mockups,
});

export const createProductHandoffSheet = (input: Omit<ListingKitInput, 'printFile' | 'mockups'> & {
  colors: string[];
}) => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const title = `${input.projectName} production handoff`;
  const placement = input.product.placement;
  doc.setFillColor(23, 38, 45);
  doc.rect(0, 0, 612, 96, 'F');
  doc.setTextColor(242, 244, 247);
  doc.setFontSize(20);
  doc.text(title, 48, 58);
  doc.setTextColor(35, 42, 51);
  doc.setFontSize(11);
  const rows = [
    ['Artwork', input.artworkName],
    ['Garment', 'Classic tee'],
    ['Print method', input.product.printMethod.toUpperCase()],
    ['Export preset', input.presetId],
    ['Placement', `${Math.round(placement.scale * 100)}% size, ${Math.round(placement.x * 100)}% across, ${Math.round(placement.y * 100)}% down`],
    ['Listing colors', input.colors.join(', ') || 'None selected'],
  ];
  let y = 138;
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 48, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 180, y, { maxWidth: 380 });
    y += 32;
  }
  doc.setDrawColor(180, 194, 200);
  doc.line(48, y + 6, 564, y + 6);
  doc.setFontSize(10);
  doc.text('Use the included transparent PNG for production. Mockups are presentation estimates only.', 48, y + 32, { maxWidth: 500 });
  return doc.output('blob');
};

export const createListingKit = async (input: ListingKitInput) => {
  const zip = new JSZip();
  const baseName = safeName(`${input.projectName}-${input.artworkName}`);
  zip.file(`${baseName}-print-ready.png`, await input.printFile.arrayBuffer());
  for (const mockup of input.mockups) {
    zip.file(
      `mockups/${baseName}-${safeName(mockup.color)}-${safeName(mockup.scene)}.png`,
      await mockup.blob.arrayBuffer(),
    );
  }
  const manifest = createListingKitManifest(input);
  zip.file('listing-kit-manifest.json', JSON.stringify(manifest, null, 2));
  const handoff = createProductHandoffSheet({
    ...input,
    colors: input.mockups.map((mockup) => mockup.color),
  });
  zip.file(`${baseName}-production-handoff.pdf`, await handoff.arrayBuffer());
  return {
    blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' }),
    filename: `${baseName}-listing-kit.zip`,
    manifest,
  };
};
