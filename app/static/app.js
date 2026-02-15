const API_BASE = '/api/whisps';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// UI Elements
const createView = document.getElementById('create-view');
const resultView = document.getElementById('result-view');
const accessView = document.getElementById('access-view');
const errorView = document.getElementById('error-view');
const createError = document.getElementById('create-error');
const createErrorMsg = document.getElementById('create-error-msg');

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

// Helper Functions
function showError(message) {
    if (createError && createErrorMsg) {
        createErrorMsg.textContent = message;
        createError.classList.remove('hidden');
        // Scroll to error
        createError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function hideError() {
    if (createError) {
        createError.classList.add('hidden');
    }
}

async function parseErrorResponse(response) {
    try {
        const data = await response.json();
        return data.detail || data.message || 'An unexpected error occurred';
    } catch (e) {
        // If response is not JSON, return generic message based on status
        switch (response.status) {
            case 400:
                return 'Invalid request. Please check your input.';
            case 413:
                return 'File is too large. Maximum size is 10MB.';
            case 500:
                return 'Server error. Please try again later.';
            default:
                return `Request failed with status ${response.status}`;
        }
    }
}

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
    // Hide any previous errors
    hideError();
    
    // Validate inputs
    if (!secretText.value.trim() && !secretFile.files[0]) {
        showError('Please enter a secret message or upload a file.');
        return;
    }
    
    const file = secretFile.files[0];
    
    // Client-side file size validation
    if (file && file.size > MAX_FILE_SIZE) {
        showError(`File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
        return;
    }
    
    // Client-side password validation
    const password = passwordInput.value;
    if (password && password.length > 200) {
        showError('Password is too long. Maximum length is 200 characters.');
        return;
    }
    
    createBtn.disabled = true;
    const originalBtnText = createBtn.innerText;
    createBtn.innerText = 'Creating...';

    try {
        let payload = secretText.value;
        let encryptedData;
        let keyStr = '';
        
        const formData = new FormData();
        formData.append('ttl_minutes', ttlSelect.value);
        if (password) formData.append('password', password);

        if (file) {
            // FILE MODE: No client-side encryption, just password protection
            // We store the filename in the 'encrypted_payload' field for metadata retrieval
            formData.append('file', file);
            formData.append('encrypted_payload', file.name); // Store filename as metadata
        } else {
            // TEXT MODE: Zero-Knowledge Encryption
            const key = await generateKey();
            keyStr = await exportKey(key);
            encryptedData = await encrypt(payload, key);
            formData.append('encrypted_payload', encryptedData);
        }

        const res = await fetch(API_BASE, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) {
            const errorMsg = await parseErrorResponse(res);
            throw new Error(errorMsg);
        }

        const data = await res.json();
        // If it's a file, we don't need a key in the URL
        const hashPart = file ? data.id : `${data.id}:${keyStr}`;
        const link = `${window.location.origin}/#${hashPart}`;
        whispLink.value = link;
        
        createView.classList.add('hidden');
        resultView.classList.remove('hidden');
    } catch (err) {
        showError(err.message || 'Failed to create whisp. Please try again.');
    } finally {
        createBtn.disabled = false;
        createBtn.innerText = originalBtnText;
    }
}

async function handleReveal() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    
    // Support both formats: #id (File) and #id:key (Text)
    let id, keyStr;
    if (hash.includes(':')) {
        const parts = hash.split(':');
        if (parts.length !== 2) {
            accessView.classList.add('hidden');
            errorView.classList.remove('hidden');
            document.getElementById('error-msg').innerText = 'Invalid whisp link format.';
            return;
        }
        [id, keyStr] = parts;
    } else {
        id = hash; // File mode (no key)
    }
    
    revealBtn.disabled = true;
    const originalBtnText = revealBtn.innerText;
    revealBtn.innerText = 'Decrypting...';

    try {
        const password = accessPassword.value;
        const url = `${API_BASE}/${id}${password ? `?password=${encodeURIComponent(password)}` : ''}`;
        
        const res = await fetch(url);
        
        if (res.status === 401) {
            // Check if this is first attempt (no password entered yet) or wrong password
            const isFirstAttempt = !password && !pwdRequired.classList.contains('hidden') === false;
            
            pwdRequired.classList.remove('hidden');
            accessPassword.focus();
            
            // Only show error if user actually tried a password
            if (password) {
                throw new Error('Incorrect password. Please try again.');
            } else {
                // First attempt - just show password field without error
                throw new Error('Password required');
            }
        }
        
        if (res.status === 404) {
            throw new Error('Whisp not found or has already been accessed.');
        }
        
        if (!res.ok) {
            const errorMsg = await parseErrorResponse(res);
            throw new Error(errorMsg);
        }

        const data = await res.json();
        
        let decrypted;
        if (data.is_file) {
            // FILE MODE: Direct Download
            // The filename is stored in encrypted_payload (unencrypted in this mode)
            const filename = data.encrypted_payload || 'downloaded_file';
            
            // Construct direct download link with authentication
            const downloadUrl = `${API_BASE}/${id}/file${password ? `?password=${encodeURIComponent(password)}` : ''}`;
            
            downloadLink.href = downloadUrl;
            downloadLink.download = filename; // Suggest filename
            downloadLink.innerText = 'Download 📥';
            
            // Show download UI
            fileDownload.classList.remove('hidden');
            secretDisplay.classList.remove('hidden');
            
            // Hide the reveal button as we've "revealed" the download link
            revealBtn.classList.add('hidden');
            pwdRequired.classList.add('hidden');
            
        } else {
            // TEXT MODE: Decrypt
            if (!keyStr) throw new Error('Missing encryption key in URL.');
            const key = await importKey(keyStr);
            
            try {
                const decryptedBuf = await decrypt(data.encrypted_payload, key);
                decrypted = new TextDecoder().decode(decryptedBuf);
                decryptedText.innerText = decrypted;
                decryptedText.classList.remove('hidden');
                
                secretDisplay.classList.remove('hidden');
                revealBtn.classList.add('hidden');
                pwdRequired.classList.add('hidden');
            } catch (decryptErr) {
                throw new Error('Decryption failed. The link may be corrupted or invalid.');
            }
        }

    } catch (err) {
        // Only show full error page if it's a fatal error
        if (err.message.includes('Password required') || err.message.includes('Incorrect password')) {
            // Keep the access view visible for password retry
            pwdRequired.classList.remove('hidden');
            
            // Only show error message if it's an incorrect password attempt (not first time)
            if (err.message.includes('Incorrect password')) {
                const existingError = document.getElementById('access-error');
                if (existingError) {
                    existingError.remove();
                }
                const errorEl = document.createElement('small');
                errorEl.id = 'access-error';
                errorEl.style.color = 'var(--red)';
                errorEl.style.display = 'block';
                errorEl.style.marginTop = '0.25rem';
                errorEl.textContent = err.message;
                accessPassword.parentNode.appendChild(errorEl);
            }
            // If "Password required", just show the field without error message
        } else {
            // Fatal error - show error view
            accessView.classList.add('hidden');
            errorView.classList.remove('hidden');
            document.getElementById('error-msg').innerText = err.message;
        }
    } finally {
        revealBtn.disabled = false;
        revealBtn.innerText = originalBtnText;
    }
}

// Character Counter and mutual exclusion with file upload
const charCount = document.getElementById('char-count');
if (secretText && charCount) {
    secretText.addEventListener('input', () => {
        const count = secretText.value.length;
        charCount.textContent = `${count.toLocaleString()} / 10,000 characters`;
        
        // Clear file selection if user starts typing
        if (secretText.value.trim() && secretFile && secretFile.files.length > 0) {
            secretFile.value = '';
            if (placeholder) placeholder.classList.remove('hidden');
            if (preview) preview.classList.add('hidden');
        }
    });
}

// Password Visibility Toggle
const togglePassword = document.getElementById('toggle-password');
const eyeIcon = document.getElementById('eye-icon');
const eyeOffIcon = document.getElementById('eye-off-icon');
if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        eyeIcon.classList.toggle('hidden');
        eyeOffIcon.classList.toggle('hidden');
        togglePassword.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
}

// Drag and Drop File Upload
const fileZone = document.getElementById('file-upload-zone');
const placeholder = document.getElementById('upload-placeholder');
const preview = document.getElementById('file-preview');
const browseBtn = document.getElementById('browse-btn');
const removeBtn = document.getElementById('remove-file');

if (fileZone && secretFile) {
    // Drag and drop events
    ['dragenter', 'dragover'].forEach(evt => {
        fileZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileZone.classList.add('dragging');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        fileZone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileZone.classList.remove('dragging');
        });
    });

    fileZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length) {
            secretFile.files = files;
            updateFilePreview(files[0]);
        }
    });

    // Browse button
    if (browseBtn) {
        browseBtn.addEventListener('click', () => secretFile.click());
    }

    // File change
    secretFile.addEventListener('change', (e) => {
        if (e.target.files.length) {
            updateFilePreview(e.target.files[0]);
            // Clear text input if user uploads a file
            if (secretText && secretText.value.trim()) {
                secretText.value = '';
                if (charCount) {
                    charCount.textContent = '0 / 10,000 characters';
                }
            }
        }
    });

    // Remove file
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            secretFile.value = '';
            if (placeholder) placeholder.classList.remove('hidden');
            if (preview) preview.classList.add('hidden');
        });
    }
}

function updateFilePreview(file) {
    if (!file) return;
    const fileNameEl = document.getElementById('file-name');
    const fileSizeEl = document.getElementById('file-size');
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatFileSize(file.size);
    if (placeholder) placeholder.classList.add('hidden');
    if (preview) preview.classList.remove('hidden');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Initialization
window.addEventListener('load', () => {
    const hash = window.location.hash.substring(1);
    // Show access view if hash exists and looks like a UUID (with or without key)
    // UUID regex (approximate): 8-4-4-4-12 hex chars
    // Whisp format: UUID or UUID:KEY
    if (hash && hash.length >= 36) {
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
