/**
 * Cryptographic utilities for secure storage of credentials using Web Crypto API.
 * Uses AES-GCM 256-bit encryption with PBKDF2 key derivation from a user PIN.
 */

const CryptoUtil = {
  /**
   * Derives a cryptographic key from a PIN string and salt
   */
  async deriveKey(pin, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Encrypts plaintext string using the provided PIN
   * Returns base64 encoded string containing salt, IV, and ciphertext
   */
  async encrypt(text, pin) {
    if (!pin) return text;
    try {
      const enc = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await this.deriveKey(pin, salt);

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        enc.encode(text)
      );

      // Pack salt (16), iv (12), ciphertext into a single byte array
      const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      combined.set(salt, 0);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(encrypted), salt.length + iv.length);

      // Convert to base64
      let binary = '';
      for (let i = 0; i < combined.byteLength; i++) {
        binary += String.fromCharCode(combined[i]);
      }
      return btoa(binary);
    } catch (err) {
      console.error('Encryption failed:', err);
      throw new Error('Encryption failed: ' + err.message);
    }
  },

  /**
   * Decrypts base64 encoded string using the provided PIN
   */
  async decrypt(encryptedBase64, pin) {
    if (!pin) return encryptedBase64;
    try {
      const binary = atob(encryptedBase64);
      const combined = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        combined[i] = binary.charCodeAt(i);
      }

      if (combined.length < 28) {
        // Not encrypted or corrupted
        return encryptedBase64;
      }

      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const ciphertext = combined.slice(28);

      const key = await this.deriveKey(pin, salt);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    } catch (err) {
      console.error('Decryption failed (incorrect PIN?):', err);
      throw new Error('Incorrect PIN or corrupted data');
    }
  }
};

if (typeof window !== 'undefined') {
  window.CryptoUtil = CryptoUtil;
}
if (typeof globalThis !== 'undefined') {
  globalThis.CryptoUtil = CryptoUtil;
}
