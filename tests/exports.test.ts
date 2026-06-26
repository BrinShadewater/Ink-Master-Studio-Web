import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import { createStudioJob } from '../services/jobModel';
import { resolveFilenamePattern } from '../services/naming';
import { buildProductionPackage } from '../services/productionPackage';
import { buildProofDescriptor, buildProofFilename, buildProofMockupCaption, generateCustomerProof } from '../services/proofBuilder';
import { createProductionProfile, reviseProductionProfile } from '../services/productionProfiles';

test('resolves and sanitizes production filename tokens', () => {
  const job = createStudioJob('River / Street');
  job.metadata.customerName = 'Alex & Co.';
  job.revision = 3;

  const name = resolveFilenamePattern(
    '{job}_{customer}_{garment}_{placement}_v{version}',
    job,
    'full-front',
  );

  assert.equal(name, 'river-street_alex-co_tshirt_full-front_v3');
});

test('builds a production package with selected assets and manifest', async () => {
  const job = createStudioJob('Package');
  job.packageOptions.includeUnderbase = true;
  job.packageOptions.selectedMockupIndices = [6];
  const result = await buildProductionPackage({
    job,
    printMaster: { filename: 'print.png', blob: new Blob(['print']) },
    productionPdf: { filename: 'spec.pdf', blob: new Blob(['pdf']) },
    mockups: [{ filename: 'black-mockup.png', blob: new Blob(['mockup']) }],
    underbase: { filename: 'underbase.png', blob: new Blob(['underbase']) },
    palette: ['#000000', '#FFFFFF'],
  });
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('job-manifest.json')!.async('string'));

  assert.ok(zip.file('print.png'));
  assert.ok(zip.file('spec.pdf'));
  assert.ok(zip.file('mockups/black-mockup.png'));
  assert.ok(zip.file('underbase.png'));
  assert.ok(zip.file('production-summary.txt'));
  assert.equal(manifest.job.name, 'Package');
  assert.equal(manifest.printSpecification.widthInches, 12);
  assert.match(manifest.placementSummary, /T-shirt front/);
  assert.match(manifest.placementSummary, /offset 0 in horizontal, 2 in from top/);
  assert.deepEqual(manifest.packageOptions.selectedMockups, [
    { slug: 'black', name: 'Black', filename: 'black-mockup.png' },
  ]);
  assert.deepEqual(
    manifest.packageAssets.filter((asset: { status: string }) => asset.status === 'included').map((asset: { filename: string }) => asset.filename),
    [
      'print.png',
      'spec.pdf',
      'mockups/black-mockup.png',
      'underbase.png',
      'production-summary.txt',
      'job-manifest.json',
    ],
  );
});

test('production package manifest records requested assets that could not be generated', async () => {
  const job = createStudioJob('Missing mockup');
  job.packageOptions.selectedMockupIndices = [6];

  const result = await buildProductionPackage({
    job,
    printMaster: { filename: 'print.png', blob: new Blob(['print']) },
    productionPdf: { filename: 'spec.pdf', blob: new Blob(['pdf']) },
    mockups: [],
    palette: [],
  });
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('job-manifest.json')!.async('string'));
  const summary = await zip.file('production-summary.txt')!.async('string');

  assert.deepEqual(
    manifest.packageAssets.filter((asset: { status: string }) => asset.status === 'missing').map((asset: { filename: string; label?: string }) => [asset.filename, asset.label]),
    [['mockups/black-mockup.png', 'Black']],
  );
  assert.match(summary, /Missing requested files: mockups\/black-mockup\.png \(Black\)/);
});

test('includes profile provenance in production package manifest without full snapshot', async () => {
  const baseProfile = createProductionProfile('Mimaki Daily DTG');
  baseProfile.id = 'profile_mimaki_daily';
  const profile = reviseProductionProfile(baseProfile, {
    printerName: 'Mimaki TxF150',
    method: 'DTF',
  });
  const job = createStudioJob('Profile package', profile);

  const result = await buildProductionPackage({
    job,
    palette: [],
  });
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('job-manifest.json')!.async('string'));

  assert.deepEqual(manifest.productionProfile, {
    id: 'profile_mimaki_daily',
    revision: 2,
    name: 'Mimaki Daily DTG',
    printerName: 'Mimaki TxF150',
    method: 'DTF',
  });
  assert.equal('snapshot' in manifest.productionProfile, false);
  assert.equal('printableAreas' in manifest.productionProfile, false);
});

test('includes profile name and revision in production summary', async () => {
  const profile = createProductionProfile('Brother GTX queue');
  profile.id = 'profile_brother_gtx';
  profile.printerName = 'Brother GTXpro';
  const job = createStudioJob('Profile summary', profile);

  const result = await buildProductionPackage({
    job,
    palette: [],
  });
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const summary = await zip.file('production-summary.txt')!.async('string');

  assert.match(summary, /Profile: Brother GTX queue/);
  assert.match(summary, /revision 1/);
  assert.match(summary, /Placement: full-front placement · T-shirt front · size L · 12×14 in · offset 0 in horizontal, 2 in from top/);
});

test('creates proof metadata with placement and approval fields', () => {
  const job = createStudioJob('Proof job');
  job.metadata.customerName = 'Taylor';
  job.metadata.notes = 'Use navy garment';

  const descriptor = buildProofDescriptor(job, job.placements[job.activePlacementKey]);

  assert.equal(descriptor.customerName, 'Taylor');
  assert.match(descriptor.placement, /T-shirt front/);
  assert.match(descriptor.placement, /12×14 in/);
  assert.match(descriptor.placement, /offset 0 in horizontal, 2 in from top/);
  assert.match(descriptor.approvalText, /approve/i);
});

test('creates proof metadata with profile provenance', () => {
  const profile = createProductionProfile('DTF night shift');
  profile.id = 'profile_night_shift';
  profile.method = 'DTF';
  const job = createStudioJob('Proof profile', profile);

  const descriptor = buildProofDescriptor(job, job.placements[job.activePlacementKey]);

  assert.deepEqual(descriptor.productionProfile, {
    name: 'DTF night shift',
    revision: 1,
    method: 'DTF',
  });
  assert.match(descriptor.productionProfileText, /DTF night shift/);
  assert.match(descriptor.productionProfileText, /revision 1/);
  assert.match(descriptor.productionProfileText, /DTF/);
});

test('creates proof metadata with editable branding fields', () => {
  const job = createStudioJob('Proof branding');
  job.proofBranding = {
    shopName: 'River City Prints',
    contactLine: 'proofs@example.com · 555-0123',
    accentColor: '#22C55E',
    footerNote: 'Reply approved to schedule production.',
  };

  const descriptor = buildProofDescriptor(job, job.placements[job.activePlacementKey]);

  assert.deepEqual(descriptor.branding, job.proofBranding);
});

test('creates customer-facing mockup captions from generated mockup filenames', () => {
  assert.equal(
    buildProofMockupCaption({ filename: 'black-mockup.png', blob: new Blob(['mockup']) }, 0),
    'Mockup 1: Black',
  );
  assert.equal(
    buildProofMockupCaption({ filename: 'customer-alt-view.png', blob: new Blob(['mockup']) }, 1),
    'Mockup 2: Customer Alt View',
  );
});

test('previews proof filenames with the same naming logic used by export', async () => {
  const job = createStudioJob('Proof / Filename');
  job.metadata.customerName = 'Alex & Co.';
  job.revision = 5;

  const filename = buildProofFilename(job, 'email');
  const proof = await generateCustomerProof(job, [], 'email');

  assert.equal(filename, 'proof-filename_alex-co_tshirt_full-front_v5_email-proof.pdf');
  assert.equal(proof.filename, filename);
});

test('generates both print and email proof PDFs', async () => {
  const job = createStudioJob('Proof PDF');
  const print = await generateCustomerProof(job, [], 'print');
  const email = await generateCustomerProof(job, [], 'email');

  assert.equal(print.blob.type, 'application/pdf');
  assert.equal(email.blob.type, 'application/pdf');
  assert.ok(print.blob.size > 500);
  assert.ok(email.blob.size > 500);
});
