// The static guide pages, as data. Kept out of StaticPages.tsx (and free of React) so
// vite.config.ts can import it too: the build writes one prerendered HTML file per route
// from these same entries and the runtime <StaticPage> renders them, so the crawlable copy
// and the rendered page cannot drift apart.

export type StaticRouteId =
  | 'privacy'
  | 'terms'
  | 'contact'
  | 'printify-file-requirements'
  | 'print-ready-file-checklist'
  | 'upscaling-art-for-t-shirt-printing'
  | 'not-found';

export interface StaticRoute {
  id: StaticRouteId;
  path: string;
  title: string;
  description: string;
  sections: Array<{
    heading: string;
    body: string;
    items?: string[];
  }>;
}

export const routes: StaticRoute[] = [
  {
    id: 'privacy',
    path: '/privacy',
    title: 'Privacy',
    description: 'How InkMaster Studio handles uploaded artwork, saved designs, and optional AI cleanup.',
    sections: [
      {
        heading: 'Artwork stays local by default',
        body: 'InkMaster Studio is local-first. Uploaded artwork, generated print files, saved designs, settings, and export history are stored in your browser on your device unless you choose to download or transfer them.',
      },
      {
        heading: 'AI cleanup',
        body: 'If AI cleanup is available and you choose to use it, the selected image is sent through the server-side /api/edit-image route. Provider keys stay server-side and are not exposed to the browser.',
      },
      {
        heading: 'No accounts for the core workflow',
        body: 'The core drop, product preset, checks, and download flow does not require an InkMaster account or a remote project workspace.',
      },
    ],
  },
  {
    id: 'terms',
    path: '/terms',
    title: 'Terms',
    description: 'Use InkMaster Studio to prepare artwork you have the right to upload and print.',
    sections: [
      {
        heading: 'Your artwork',
        body: 'You are responsible for making sure you have the rights and permissions needed to upload, edit, print, and sell the artwork you process with InkMaster Studio.',
      },
      {
        heading: 'Print readiness',
        body: 'InkMaster Studio creates files based on selected presets and local checks. Print-on-demand services and individual providers may apply their own upload validation, print-area, and quality rules.',
      },
      {
        heading: 'Local-first software',
        body: 'Saved designs and exports are stored in your browser. Clearing browser data can remove local records, so download important print files and portable backups when needed.',
      },
    ],
  },
  {
    id: 'contact',
    path: '/contact',
    title: 'Contact',
    description: 'Contact information for InkMaster Studio feedback, issues, and support requests.',
    sections: [
      {
        heading: 'Product feedback',
        body: 'For bugs, feature requests, or product questions, use the project repository or the contact channel linked from the site owner profile.',
      },
      {
        heading: 'Security',
        body: 'Do not send API keys or private artwork in public issue text. Report security-sensitive problems with enough detail to reproduce the issue without exposing secrets.',
      },
    ],
  },
  {
    id: 'printify-file-requirements',
    path: '/printify-file-requirements',
    title: 'Printify File Requirements Explained',
    description: 'A plain-language guide to Printify file types, size limits, DPI, RGB color, and product-specific requirements.',
    sections: [
      {
        heading: 'Supported upload shapes',
        body: 'Printify supports PNG, JPEG, and SVG uploads. InkMaster Studio defaults to PNG because it preserves transparency and works well for creator artwork.',
        items: ['PNG/JPEG cap: 100 MB', 'SVG cap: 20 MB', 'Standard raster target: 300 DPI', 'Large products may use 120-150 DPI'],
      },
      {
        heading: 'Product-specific sizes',
        body: 'The exact print area can vary by product, print provider, and print placement. InkMaster presets provide practical starter targets, and Product Creator remains the final source for provider-specific dimensions.',
      },
    ],
  },
  {
    id: 'print-ready-file-checklist',
    path: '/print-ready-file-checklist',
    title: 'Print-Ready File Checklist',
    description: 'A simple checklist creators can use before uploading art to a print-on-demand product creator.',
    sections: [
      {
        heading: 'Before upload',
        body: 'A print-ready file should match the product size, keep important art inside the print area, use RGB color, and stay within the upload service file-size limit.',
        items: ['Pick the product before exporting', 'Use transparent PNG for cutout artwork', 'Avoid tiny source images for large prints', 'Check that text remains readable at print size'],
      },
      {
        heading: 'What InkMaster checks',
        body: 'The default InkMaster flow reports product sizing, upscale notes, DPI, RGB output, transparency, and file-size cap status in plain language.',
      },
    ],
  },
  {
    id: 'upscaling-art-for-t-shirt-printing',
    path: '/upscaling-art-for-t-shirt-printing',
    title: 'Upscaling Art for T-Shirt Printing',
    description: 'How to think about upscaling smaller artwork for a full-front t-shirt print file.',
    sections: [
      {
        heading: 'Upscaling is useful, not magic',
        body: 'A smaller image can be resized to a t-shirt artboard, but the original detail still matters. Clean logos and bold art usually upscale better than low-resolution photos or tiny text.',
      },
      {
        heading: 'When to remake the source',
        body: 'If the source is very small, blurry, or full of compressed edges, remake or re-export the artwork at a larger size before sending it to a print-on-demand service.',
      },
    ],
  },
];
