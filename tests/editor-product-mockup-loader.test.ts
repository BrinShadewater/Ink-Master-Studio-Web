import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTShirtMockup } from '../editor/productCatalog';
import {
  createProductMockupLoadController,
  type ProductMockupLoadState,
} from '../editor/productMockupLoader';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

const createHarness = () => {
  const images: FakeImage[] = [];
  const states: ProductMockupLoadState[] = [];
  const controller = createProductMockupLoadController(
    () => {
      const image = new FakeImage();
      images.push(image);
      return image;
    },
    (state) => states.push(state),
  );
  return { controller, images, states };
};

test('retains the last ready shirt while a replacement fails', () => {
  const { controller, images, states } = createHarness();
  controller.sync(getTShirtMockup('black'));
  images[0].onload?.();
  controller.sync(getTShirtMockup('red'));

  assert.equal(states.at(-1)?.status, 'pending');
  assert.equal(states.at(-1)?.requestedMockup?.slug, 'red');
  assert.equal(states.at(-1)?.displayedMockup?.slug, 'black');

  images[1].onerror?.();
  assert.equal(states.at(-1)?.requestedMockup?.slug, 'red');
  assert.equal(states.at(-1)?.displayedMockup?.slug, 'black');
  assert.equal(states.at(-1)?.status, 'failed');
  assert.equal(states.at(-1)?.error, 'Red shirt preview is unavailable.');
});

test('ignores stale callbacks after replacement authority changes', () => {
  const { controller, images, states } = createHarness();
  controller.sync(getTShirtMockup('black'));
  const staleLoad = images[0].onload;
  const staleError = images[0].onerror;
  controller.sync(getTShirtMockup('navy'));
  const publications = states.length;

  staleLoad?.();
  staleError?.();
  assert.equal(states.length, publications);
  assert.equal(states.at(-1)?.requestedMockup?.slug, 'navy');
  assert.equal(states.at(-1)?.displayedMockup, null);

  images[1].onload?.();
  assert.equal(states.at(-1)?.displayedMockup?.slug, 'navy');
  assert.equal(states.at(-1)?.status, 'ready');
});

test('retries only the current failed request and retains its prior shirt', () => {
  const { controller, images, states } = createHarness();
  controller.sync(getTShirtMockup('black'));
  images[0].onload?.();
  controller.sync(getTShirtMockup('heather'));
  images[1].onerror?.();

  controller.retry();
  assert.equal(images.length, 3);
  assert.equal(images[2].src, '/mockups/mockup-heather.png');
  assert.equal(states.at(-1)?.status, 'pending');
  assert.equal(states.at(-1)?.displayedMockup?.slug, 'black');
  images[2].onload?.();
  assert.equal(states.at(-1)?.displayedMockup?.slug, 'heather');
});

test('clears authority for a null request and disposes idempotently', () => {
  const { controller, images, states } = createHarness();
  controller.sync(getTShirtMockup('orange'));
  const staleLoad = images[0].onload;
  controller.sync(null);
  assert.deepEqual(states.at(-1), {
    requestedMockup: null,
    displayedMockup: null,
    status: 'idle',
    error: null,
  });

  const publications = states.length;
  staleLoad?.();
  controller.dispose();
  controller.dispose();
  controller.retry();
  controller.sync(getTShirtMockup('red'));
  assert.equal(states.length, publications);
  assert.equal(images[0].onload, null);
  assert.equal(images[0].onerror, null);
});

test('contains loader construction and source assignment failures', () => {
  const states: ProductMockupLoadState[] = [];
  const controller = createProductMockupLoadController(
    () => {
      throw new Error('blocked');
    },
    (state) => states.push(state),
  );
  controller.sync(getTShirtMockup('burgundy'));
  assert.equal(states.at(-1)?.status, 'failed');
  assert.equal(states.at(-1)?.error, 'Burgundy shirt preview is unavailable.');
});
