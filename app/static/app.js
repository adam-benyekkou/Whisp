const API_BASE = '/api/whisps';

// UI Elements
const createView = document.getElementById('create-view');
const resultView = document.getElementById('result-view');
const accessView = document.getElementById('access-view');
const errorView = document.getElementById('error-view');

const secretText = document.getElementById('secret-text');
const secretFile = document.getElementById('secret-file');
const passwordInput = document.getElementById('password');
const ttlSelect = document.getElementById('ttl');
const createBtn = document.getElementById('create-btn');

const whispLink = document.getElementById('whisp-link');
const copyBtn = document.getElementById('copy-btn');

const revealBtn = document.getElementById('reveal-btn');
const accessPassword = document.getElementById('access-password');
const pwdRequired = document.getElementById('pwd-required');
const secretDisplay = document.getElementById('secret-display');
const decryptedText = document.getElementById('decrypted-text');
const fileDownload = document.getElementById('file-download');
const downloadLink = document.getElementById('download-link');

// Crypto Utilities
async function generateKey() {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function exportKey(key) {
    const exported = await crypto.subtle.exportKey("raw", key);
    return b64encode(exported);
}

async function importKey(keyData) {
    return await crypto.subtle.importKey(
        "raw",
        b64decode(keyData),
        "AES-GCM",
        true,
        ["encrypt", "decrypt"]
    );
}

function b64encode(buf) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return new Uint8Array(atob(str).split("").map(c => c.charCodeAt(0))).buffer;
}

async function encrypt(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return b64encode(combined);
}

async function decrypt(combinedB64, key) {
    const combined = new Uint8Array(b64decode(combinedB64));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        ciphertext
    );
    return decrypted;
}

// Logic
async function handleCreate() {
    createBtn.disabled = true;
    createBtn.innerText = 'Creating...';

    try {
        const key = await generateKey();
        const keyStr = await exportKey(key);
        
        let payload = secretText.value;
        const file = secretFile.files[0];
        
        // If it's a file, we encrypt the file metadata and the file itself
        // For simplicity in this v1, if file exists, we encrypt the string "FILE" 
        // and upload the encrypted file separately or just encrypt the string.
        // Actually, let's just support string for now or encrypt file content as B64.
        
        let encryptedData;
        if (file) {
            const reader = new FileReader();
            const fileContent = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsArrayBuffer(file);
            });
            encryptedData = await encrypt(fileContent, key);
        } else {
            encryptedData = await encrypt(payload, key);
        }

        const formData = new FormData();
        formData.append('encrypted_payload', encryptedData);
        formData.append('ttl_minutes', ttlSelect.value);
        if (passwordInput.value) formData.append('password', passwordInput.value);
        if (file) {
            // We just send the encrypted blob as a file if we want, 
            // but for simplicity let's just use the 'encrypted_payload' field for now
            // or we could attach the 'file' but it would be unencrypted on server.
            // BETTER: Encrypt file client-side, then upload as a blob.
            const blob = new Blob([b64decode(encryptedData)], { type: 'application/octet-stream' });
            formData.set('encrypted_payload', 'FILE_ATTACHED');
            formData.append('file', blob, file.name);
        }

        const res = await fetch(API_BASE, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Failed to create whisp');

        const data = await res.json();
        const link = `${window.location.origin}/#${data.id}:${keyStr}`;
        whispLink.value = link;
        
        createView.classList.add('hidden');
        resultView.classList.remove('hidden');
    } catch (err) {
        alert(err.message);
    } finally {
        createBtn.disabled = false;
        createBtn.innerText = 'Create Secure Whisp';
    }
}

async function handleReveal() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    
    const [id, keyStr] = hash.split(':');
    revealBtn.disabled = true;
    revealBtn.innerText = 'Decrypting...';

    try {
        const password = accessPassword.value;
        const url = `${API_BASE}/${id}${password ? `?password=${encodeURIComponent(password)}` : ''}`;
        
        const res = await fetch(url);
        if (res.status === 401) {
            pwdRequired.classList.remove('hidden');
            throw new Error('Password required');
        }
        if (!res.ok) throw new Error('Whisp not found or expired');

        const data = await res.json();
        const key = await importKey(keyStr);
        
        let decrypted;
        if (data.is_file) {
            const fileRes = await fetch(`${API_BASE}/${id}/file${password ? `?password=${encodeURIComponent(password)}` : ''}`);
            const encryptedBlob = await fileRes.arrayBuffer();
            // The file on server is already the encrypted blob (from handleCreate)
            // But wait, my handleCreate sent it as a file.
            // Let's assume the file content is the ciphertext.
            const iv_ciphertext = new Uint8Array(encryptedBlob);
            const iv = iv_ciphertext.slice(0, 12);
            const ciphertext = iv_ciphertext.slice(12);
            decrypted = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                ciphertext
            );
            
            const blob = new Blob([decrypted], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            downloadLink.download = 'decrypted_file';
            fileDownload.classList.remove('hidden');
        } else {
            const decryptedBuf = await decrypt(data.encrypted_payload, key);
            decrypted = new TextDecoder().decode(decryptedBuf);
            decryptedText.innerText = decrypted;
            decryptedText.classList.remove('hidden');
        }

        secretDisplay.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        pwdRequired.classList.add('hidden');
    } catch (err) {
        if (err.message !== 'Password required') {
            accessView.classList.add('hidden');
            errorView.classList.remove('hidden');
            document.getElementById('error-msg').innerText = err.message;
        }
    } finally {
        revealBtn.disabled = false;
        revealBtn.innerText = 'Reveal Secret';
    }
}

// Initialization
window.addEventListener('load', () => {
    const hash = window.location.hash.substring(1);
    if (hash && hash.includes(':')) {
        createView.classList.add('hidden');
        accessView.classList.remove('hidden');
    }
});

createBtn.addEventListener('click', handleCreate);
revealBtn.addEventListener('click', handleReveal);
copyBtn.addEventListener('click', () => {
    whispLink.select();
    document.execCommand('copy');
    copyBtn.innerText = '✅';
    setTimeout(() => copyBtn.innerText = '📋', 2000);
});
