// Simple obfuscation for field-level encryption demo
export const encryptField = (text: string): string => {
  if (!text) return text;
  try {
    return 'ENC:' + btoa(encodeURIComponent(text));
  } catch (e) {
    return text;
  }
};

export const decryptField = (text: string): string => {
  if (!text || !text.startsWith('ENC:')) return text;
  try {
    return decodeURIComponent(atob(text.slice(4)));
  } catch (e) {
    return text;
  }
};
