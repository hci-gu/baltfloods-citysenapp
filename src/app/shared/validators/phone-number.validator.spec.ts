import { FormControl } from '@angular/forms';
import { phoneNumberValidator } from './phone-number.validator';

describe('phoneNumberValidator', () => {
  const finnishPhoneNumber = '+3584573990004';

  it('should return null if value is empty', () => {
    const control = new FormControl('');
    const result = phoneNumberValidator(control);

    expect(result).toEqual(null);
  });

  it('should return null if phone number is valid', () => {
    const control = new FormControl(finnishPhoneNumber, phoneNumberValidator);
    const result = phoneNumberValidator(control);

    expect(result).toEqual(null);
  });

  it('requires a country code instead of assuming the previous city', () => {
    expect(phoneNumberValidator(new FormControl('04573990004'))).toEqual({
      invalidPhoneNumber: true,
    });
    expect(phoneNumberValidator(new FormControl('+46701234567'))).toBeNull();
  });

  it('should return error object if phone number is invalid', () => {
    const control = new FormControl('12345', phoneNumberValidator);
    const result = phoneNumberValidator(control);

    expect(result).toEqual({ invalidPhoneNumber: true });
  });

  it('should return error object if phone number is not valid', () => {
    const control = new FormControl('+32412345678');
    const result = phoneNumberValidator(control);

    expect(result).toEqual({ invalidPhoneNumber: true });
  });
});
