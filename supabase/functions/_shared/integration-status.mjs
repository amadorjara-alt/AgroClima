// Solo metadatos: nunca devuelve claves, ciphertext ni valores de entorno.
export function ocrConfiguration(integrations, hasProjectKey) {
    const personal=Array.isArray(integrations)&&integrations.some(row=>row.provider==='ocrspace');
    return {configured:personal||Boolean(hasProjectKey),source:personal?'account':hasProjectKey?'project':null};
}
