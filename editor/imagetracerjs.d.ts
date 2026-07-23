declare module 'imagetracerjs' {
  export interface ImageTracerOptions {
    numberofcolors: number;
    ltres: number;
    qtres: number;
    pathomit: number;
    blurradius: number;
    colorsampling: number;
    viewbox: boolean;
    strokewidth: number;
    desc?: boolean;
    scale?: number;
    pal?: Array<{ r: number; g: number; b: number; a: number }>;
  }

  const ImageTracer: {
    imagedataToSVG(
      imageData: { width: number; height: number; data: Uint8ClampedArray },
      options: ImageTracerOptions,
    ): string;
  };

  export default ImageTracer;
}
