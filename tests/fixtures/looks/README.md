# Look Processor Golden Fixtures

The byte fixtures in `tests/editor-look-processor.test.ts` are the rendering
contract for normalized Look recipes. The primary input is a 4-by-4 straight-
alpha RGBA frame containing black, white, RGB primaries and secondaries, neutral
and colored midtones, two partial-alpha pixels, and a colored zero-alpha pixel.

## Shared arithmetic

- Every named color stage clamps to 0 through 255 and rounds with `Math.round`.
- Rec. 709 luminance is `0.2126r + 0.7152g + 0.0722b`.
- Standard contrast is `127.5 + (value - 127.5) * (1 + contrast / 100)`.
- High Contrast uses the stronger factor `1 + contrast / 50`.
- Saturation is `luminance + (channel - luminance) * (1 + saturation / 100)`.
- Hex colors are parsed as six-digit sRGB bytes. Channel interpolation is linear.
- Strength clamps to 0 through 100. It interpolates alpha and `channel * alpha / 255`,
  unpremultiplies with the unrounded interpolated alpha, then rounds all output
  bytes. RGB is explicitly zero when rounded output alpha is zero.

## Look algorithms

- Clean Photo applies standard contrast, then saturation. Clarity builds a
  separable horizontal/vertical three-tap box blur of premultiplied RGB and alpha
  with clamped edge samples. It unpremultiplies the blur and adds the base-minus-
  blur difference, bounded to -64 through 64, scaled by `clarity / 30`.
- High Contrast maps each channel from `[blackPoint, 255]` to `[0, 255]`, applies
  stronger contrast, then saturation.
- Monochrome rounds Rec. 709 luminance, adds `brightness * 2.55`, then applies
  standard contrast.
- Duotone rounds luminance and uses
  `clamp(luminance / 255 + balance / 100, 0, 1)` between shadow and highlight.
- Posterized applies standard contrast, then uses
  `round(channel * (levels - 1) / 255) * 255 / (levels - 1)`.
- Graphic Halftone rotates canonical integer coordinates around `(2048, 2048)`.
  One design unit is `4096 / 1000` canonical units. A pixel is ink when its
  distance from the cell center is at most
  `sqrt(1 - luminance / 255) * cellSize / sqrt(2)`. Transparent mode emits the
  foreground with source alpha only at covered ink pixels. Solid mode emits
  opaque foreground at covered ink pixels and opaque background everywhere else.
- Vintage Ink maps rounded luminance from shadow `[38, 30, 28]` to highlight
  `[245, 226, 186]`, mixes that target with source RGB by `warmth / 100`, maps
  the tonal endpoints to `[32 * fade / 100, 255 - 20 * fade / 100]`, and adds
  one zero-mean grain offset with maximum magnitude `32 * grain / 100`.
- Distressed Print combines 65 percent fine hash noise at `textureScale * 48`
  with 35 percent coarse noise at `textureScale * 12`. Manhattan distance to
  transparent coverage or the canvas exterior supplies a four-pixel edge factor;
  partial alpha also contributes `1 - alpha / 255`. Wear and edge removal are
  combined as independent alpha reductions. Source RGB is retained, and source
  zero-alpha pixels remain transparent black.

## Canonical texture hash

Pixel centers map to integer coordinates with
`floor((index + 0.5) * 4096 / dimension)`, clamped to 0 through 4095. The positive
integer scale divides that space into a normalized lattice before hashing. The
hash starts from the unsigned seed, XORs `Math.imul` products for `x + 1`, `y + 1`,
and scale using `0x9e3779b1`, `0x85ebca77`, and `0xc2b2ae3d`, then avalanches with
shift 16, `0x7feb352d`, shift 15, `0x846ca68b`, and shift 16. The unsigned result
is divided by `0xffffffff`, producing an inclusive `[0, 1]` value. Vintage grain
uses scale 1024. Distress XORs the coarse seed with `0x9e3779b9`.

## Golden review policy

The expected arrays were calculated before the processor implementation in a
standalone arithmetic worksheet, then reviewed independently of production code.
The review checked identity and endpoint cases plus representative pixels for
Rec. 709 red, duotone endpoints, posterization levels, halftone coverage, alpha
preservation, and seeded alpha removal. Tests store literal reviewed arrays; they
do not generate expectations from processor helpers. Any algorithm change requires
fresh independent calculation and byte review, never a snapshot copied from the
processor output.
