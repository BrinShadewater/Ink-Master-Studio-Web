import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import { createStudioJob } from '../services/jobModel';
import { resolveFilenamePattern } from '../services/naming';
import { buildProductionPackage } from '../services/productionPackage';
import { buildProofDescriptor, generateCustomerProof } from '../services/proofBuilder';
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
  const result = await buildProductionPackage({
    job,
    printMaster: { filename: 'print.png', blob: new Blob(['print']) },
    productionPdf: { filename: 'spec.pdf', blob: new Blob(['pdf']) },
    mockups: [{ filename: 'black.png', blob: new Blob(['mockup']) }],
    underbase: { filename: 'underbase.png', blob: new Blob(['underbase']) },
    palette: ['#000000', '#FFFFFF'],
  });
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('job-manifest.json')!.async('string'));

  assert.ok(zip.file('print.png'));
  assert.ok(zip.file('spec.pdf'));
  assert.ok(zip.file('mockups/black.png'));
  assert.ok(zip.file('underbase.png'));
  assert.ok(zip.file('production-summary.txt'));
  assert.equal(manifest.job.name, 'Package');
  assert.equal(manifest.printSpecification.widthInches, 12);
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
});

test('creates proof metadata with placement and approval fields', () => {
  const job = createStudioJob('Proof job');
  job.metadata.customerName = 'Taylor';
  job.metadata.notes = 'Use navy garment';

  const descriptor = buildProofDescriptor(job, job.placements[job.activePlacementKey]);

  assert.equal(descriptor.customerName, 'Taylor');
  assert.match(descriptor.placement, /12×14 in/);
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

test('generates both print and email proof PDFs', async () => {
  const job = createStudioJob('Proof PDF');
  const print = await generateCustomerProof(job, [], 'print');
  const email = await generateCustomerProof(job, [], 'email');

  assert.equal(print.blob.type, 'application/pdf');
  assert.equal(email.blob.type, 'application/pdf');
  assert.ok(print.blob.size > 500);
  assert.ok(email.blob.size > 500);
});
