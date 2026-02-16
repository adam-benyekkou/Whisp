/**
 * Web Crypto API Wrapper for Whisp
 * Implements PBKDF2 key derivation and AES-GCM encryption for zero-knowledge storage.
 */

window.WhispCrypto = (function() {
    // Encryption parameters
    const ALGORITHM = {
        name: "AES-GCM",
        length: 256
    };

    // Key derivation parameters
    const KDF_ALGORITHM = {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: 100000
    };

    /**
     * Generates a cryptographically strong random key (password).
     * This is used as the 'master' secret for a specific whisp link.
     */
    async function generateKey() {
        const key = await crypto.subtle.generateKey(
            ALGORITHM,
            true,
            ["encrypt", "decrypt"]
        );
        const exported = await crypto.subtle.exportKey("raw", key);
        return arrayBufferToBase64(exported);
    }

    /**
     * Encrypts a text payload using a password-derived key.
     */
    async function encryptPayload(text, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedText = new TextEncoder().encode(text);

        const key = await deriveKey(password, salt, ["encrypt"]);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: ALGORITHM.name, iv: iv },
            key,
            encodedText
        );

        return {
            cipherText: arrayBufferToBase64(ciphertext),
            iv: arrayBufferToBase64(iv),
            salt: arrayBufferToBase64(salt)
        };
    }

    /**
     * Decrypts a payload using a password-derived key.
     */
    async function decryptPayload(cipherText, password, iv, salt) {
        // Ensure we are working with correct salt format
        const saltBuffer = (typeof salt === 'string') ? base64ToArrayBuffer(salt) : salt;
        const key = await deriveKey(password, saltBuffer, ["decrypt"]);
        
        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: ALGORITHM.name, iv: base64ToArrayBuffer(iv) },
                key,
                base64ToArrayBuffer(cipherText)
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption operation failed:", e);
            throw new Error("Decryption failed. Invalid password or corrupted data.");
        }
    }

    async function deriveKey(password, salt, usages) {
        const passwordKey = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            KDF_ALGORITHM,
            false,
            ["deriveKey"]
        );

        const saltBuffer = (typeof salt === 'string') ? base64ToArrayBuffer(salt) : salt;

        return await crypto.subtle.deriveKey(
            {
                ...KDF_ALGORITHM,
                salt: saltBuffer
            },
            passwordKey,
            ALGORITHM,
            false,
            usages
        );
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function base64ToArrayBuffer(base64) {
        if (typeof base64 !== 'string') return base64;
        let str = base64.replace(/-/g, '+').replace(/_/g, '/');
        const pad = (4 - (str.length % 4)) % 4;
        str += '='.repeat(pad);
        const binary_string = atob(str);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    return {
        generateKey,
        encryptPayload,
        decryptPayload
    };
})();
