import { normalizeImageUrl } from './image-url.utils';

describe('normalizeImageUrl', () => {
  const apiUrl = 'https://api.example.test/api';
  const uploadsUrl = 'https://uploads.example.test/uploads';
  const photoPath = 'files/observations/uploaded-1/photo%20name.jpg?thumb=100x100';

  it.each([
    `/api/${photoPath}`,
    `api/${photoPath}`,
    `../api/${photoPath}`,
    `../../api/${photoPath}`,
    `/${photoPath}`,
    photoPath,
    ` /api/${photoPath} `,
  ])('resolves %s against the configured API base', (path) => {
    expect(normalizeImageUrl(path, apiUrl, uploadsUrl)).toBe(
      `${apiUrl}/${photoPath}`,
    );
  });

  it.each([
    'https://api.example.test/api/',
    'https://api.example.test/backend/api',
    '/api',
    '/backend/api/',
  ])('supports the API base %s without duplicating /api', (base) => {
    expect(normalizeImageUrl(`/api/${photoPath}`, base, uploadsUrl)).toBe(
      `${base.replace(/\/$/, '')}/${photoPath}`,
    );
  });

  it.each([
    '/assets/images/water_overflow.jpg',
    '/assets/images/waterbag_testkit.jpg',
    `https://other.example.test/api/${photoPath}`,
  ])('preserves the image location %s', (path) => {
    expect(normalizeImageUrl(path, apiUrl, uploadsUrl)).toBe(path);
  });

  it('resolves legacy uploads against the upload base', () => {
    expect(normalizeImageUrl('../waterbag/photo.jpg', apiUrl, `${uploadsUrl}/`)).toBe(
      `${uploadsUrl}/waterbag/photo.jpg`,
    );
  });
});
