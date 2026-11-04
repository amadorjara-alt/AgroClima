// Compatible con las credenciales AES-256-GCM existentes: Base64 del
// ciphertext con etiqueta GCM y un IV independiente de 12 bytes; sin AAD.
export function decodeBase64(value) {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}
export function encodeBase64(value) {
    let binary = "";
    value.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}
async function importKey(encoded, usages) {
    if (!encoded) throw new Error("Falta configurar CREDENTIALS_ENCRYPTION_KEY en Supabase.");
    const raw = decodeBase64(encoded);
    if (raw.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY debe contener 32 bytes en Base64.");
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}
export async function encryptSecret(secret, encodedKey) {
    const key = await importKey(encodedKey, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
    return { encrypted_key: encodeBase64(new Uint8Array(encrypted)), iv: encodeBase64(iv) };
}
export async function decryptSecret(record, encodedKey) {
    const iv = decodeBase64(record.iv);
    if (iv.length !== 12) throw new Error("La credencial guardada tiene un IV no válido.");
    const key = await importKey(encodedKey, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, decodeBase64(record.encrypted_key));
    return new TextDecoder().decode(decrypted);
}
// Un campo vacío nunca significa borrar una credencial.
export function validateCredentialChange(apiKey, hasExisting) {
    const value = typeof apiKey === "string" ? apiKey.trim() : "";
    if (!value) {
        if (!hasExisting) throw new Error("Introduce una clave API para configurar este proveedor.");
        return { preserve: true, value: "" };
    }
    if (value.length < 8 || value.length > 4096) throw new Error("La clave API no tiene una longitud válida.");
    return { preserve: false, value };
}
