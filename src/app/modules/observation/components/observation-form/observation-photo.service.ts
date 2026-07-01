import { Injectable } from '@angular/core';
import imageCompression, { Options } from 'browser-image-compression';

export const OBSERVATION_PHOTO_COMPRESSION_OPTIONS: Options = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

@Injectable({ providedIn: 'root' })
export class ObservationPhotoService {
  public async getCompressedPhoto(photo: File | null): Promise<File | null> {
    if (!photo) {
      return null;
    }

    try {
      const compressedPhoto = await imageCompression(
        photo,
        OBSERVATION_PHOTO_COMPRESSION_OPTIONS,
      );

      return new File([compressedPhoto], photo.name, {
        type: compressedPhoto.type || photo.type,
        lastModified: photo.lastModified,
      });
    } catch {
      return photo;
    }
  }
}
