export const normalizeImageUrl = (
  imageUrl: string,
  pocketbaseUrl: string,
  streetAiUploadUrl: string,
): string => {
  let normalized = imageUrl.trim();
  const pocketbaseBase = pocketbaseUrl.replace(/\/$/, '');

  if (normalized.startsWith('../')) {
    normalized = normalized.replace(/^(\.\.\/)+/, '');
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith('/api/')) {
    return normalized;
  }

  if (normalized.startsWith('api/')) {
    return `/${normalized.replace(/^\/+/, '')}`;
  }

  if (normalized.startsWith('/files/')) {
    return `${pocketbaseBase}/${normalized.replace(/^\/+/, '')}`;
  }

  if (normalized.startsWith('files/')) {
    return `${pocketbaseBase}/${normalized}`;
  }

  if (normalized.startsWith('/')) {
    return normalized;
  }

  return `${streetAiUploadUrl.replace(/\/$/, '')}/${normalized.replace(/^\/+/, '')}`;
};
