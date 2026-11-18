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

  // PocketBase file paths belong to the configured API, which may be on a
  // different host from the frontend. The base already includes /api.
  if (/^\/?api\//.test(normalized)) {
    return `${pocketbaseBase}/${normalized.replace(/^\/?api\//, '')}`;
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
