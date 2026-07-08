export const filenameToDesignName = (filename: string) => {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const uuidish = /^[a-z]{1,4}\s+\d{8}\s+\d{6}\s+[a-f0-9]{6,}/i.test(stem)
    || /[a-f0-9]{8}\s+[a-f0-9]{4}\s+[a-f0-9]{4}/i.test(stem);
  if (uuidish) {
    const dateMatch = /(\d{4})(\d{2})(\d{2})/.exec(stem);
    if (dateMatch) {
      const date = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
      const label = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
      return `Untitled design - ${label}`;
    }
    return 'Untitled design';
  }

  return stem
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 64)
    || 'Untitled design';
};
