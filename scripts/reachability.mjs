import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Import matching runs against whole files so multiline imports remain visible.
// Type-only imports are included conservatively, so this proves source
// references rather than the exact production bundle. Later bundle checks
// provide the separate proof of what ships.

const sourceExtensions = ['.ts', '.tsx', '.js', '.mjs'];
const scannedDirectories = ['components', 'editor', 'services', 'workers', 'api'];
const sourceDirectories = ['components', 'editor', 'services', 'workers'];

const toPosixPath = (filePath) => filePath.split(path.sep).join('/');

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const resolveSourcePath = async (specifier, importerPath, repoRoot) => {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return null;
  }

  const basePath = specifier.startsWith('/')
    ? path.join(repoRoot, specifier.slice(1))
    : path.resolve(path.dirname(importerPath), specifier);
  const explicitExtension = path.extname(basePath);

  if (explicitExtension && !sourceExtensions.includes(explicitExtension)) {
    return null;
  }

  const candidates = explicitExtension
    ? [basePath]
    : [
        ...sourceExtensions.map((extension) => `${basePath}${extension}`),
        ...sourceExtensions.map((extension) => path.join(basePath, `index${extension}`)),
      ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
};

const collectImportSpecifiers = (source) => {
  const specifiers = [];
  const staticImportPattern =
    /\bimport\s+(?!\s*\()(?:(?:type\s+)?[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportPattern =
    /\bexport\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*)\s+from\s+['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

  for (const pattern of [staticImportPattern, exportPattern]) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[2]);
  }

  return specifiers;
};

export const collectReachable = async (entryPath) => {
  const repoRoot = process.cwd();
  const absoluteEntryPath = path.resolve(entryPath);
  const queue = [absoluteEntryPath];
  const visited = new Set();

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const relativePath = toPosixPath(path.relative(repoRoot, currentPath));

    if (visited.has(relativePath)) {
      continue;
    }

    visited.add(relativePath);
    const source = await readFile(currentPath, 'utf8');
    const specifiers = collectImportSpecifiers(source);

    for (const specifier of specifiers) {
      const resolvedPath = await resolveSourcePath(specifier, currentPath, repoRoot);
      if (resolvedPath) {
        queue.push(resolvedPath);
      }
    }
  }

  return visited;
};

const collectSourceFiles = async (directoryPath) => {
  if (!(await fileExists(directoryPath))) {
    return [];
  }

  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (entry.isFile() && ['.ts', '.tsx'].includes(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
};

export const collectSourceModules = async (rootDir) => {
  const files = (
    await Promise.all(
      sourceDirectories.map((directory) => collectSourceFiles(path.join(rootDir, directory))),
    )
  ).flat();

  return files
    .map((filePath) => toPosixPath(path.relative(rootDir, filePath)))
    .sort();
};

export const findDynamicImportSpecifiers = async (rootDir) => {
  const files = (
    await Promise.all(
      scannedDirectories.map((directory) => collectSourceFiles(path.join(rootDir, directory))),
    )
  ).flat().sort();
  const computedSpecifiers = [];
  const dynamicImportPattern = /\bimport\s*\(\s*([\s\S]*?)\s*\)/g;

  for (const filePath of files) {
    const source = await readFile(filePath, 'utf8');

    for (const match of source.matchAll(dynamicImportPattern)) {
      const specifier = match[1].trim();
      const isPlainString =
        (/^'[^']*'$/.test(specifier) || /^"[^"]*"$/.test(specifier)) &&
        !specifier.includes('\n');

      if (!isPlainString) {
        computedSpecifiers.push(specifier);
      }
    }
  }

  return computedSpecifiers.sort();
};
