import {extractReceiptData} from './receipt-parser.mjs';

export class OCRProviderError extends Error {
    constructor(message, {status = 502, code = 'OCR_PROVIDER_ERROR'} = {}) {
        super(message); this.name = 'OCRProviderError'; this.status = status; this.code = code;
    }
}
const MAX_BYTES = 900_000;
export async function readWithOCRSpace(file, apiKey, {fetchImpl = fetch} = {}) {
    if (!apiKey || typeof apiKey !== 'string') throw new OCRProviderError('Configura la clave gratuita de OCR.space en la bóveda del servidor.', {status: 503, code: 'OCR_KEY_MISSING'});
    if (!file || file.size <= 0 || file.size > MAX_BYTES) throw new OCRProviderError('El plan gratuito requiere un archivo inferior a 900 KB. Comprime la foto o el PDF.', {status: 413, code: 'OCR_FILE_TOO_LARGE'});
    const types = {'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'};
    if (!types[file.type]) throw new OCRProviderError('Usa PNG, JPG o PDF. Convierte WEBP antes de utilizar esta API.', {status: 415, code: 'OCR_UNSUPPORTED_TYPE'});
    const magic = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const valid = file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v,i)=>magic[i]===v)
        : file.type === 'image/jpeg' ? magic[0]===255 && magic[1]===216 && magic[2]===255
        : String.fromCharCode(...magic.slice(0,5)) === '%PDF-';
    if (!valid) throw new OCRProviderError('El contenido del archivo no coincide con su formato.', {status: 415, code: 'OCR_INVALID_FILE'});
    const form = new FormData();
    form.set('file',file,'comprobante.'+types[file.type]);
    form.set('OCREngine','2'); form.set('language','auto'); form.set('isTable','true');
    form.set('scale','true'); form.set('detectOrientation','true'); form.set('isOverlayRequired','false');
    let response;
    try {
        response = await fetchImpl('https://api.ocr.space/parse/image', {method:'POST',headers:{apikey:apiKey},body:form,signal:AbortSignal.timeout(60_000)});
    } catch { throw new OCRProviderError('OCR.space no respondió a tiempo.', {status:504,code:'OCR_TIMEOUT'}); }
    if (!response.ok) {
        const status = [401,403,429].includes(response.status) ? response.status : 502;
        const reason = status === 429 ? 'Cuota gratuita o límite de solicitudes alcanzado.' : status === 401 || status === 403 ? 'OCR.space rechazó la clave API.' : 'OCR.space no pudo atender la solicitud.';
        throw new OCRProviderError(reason, {status,code:'OCR_HTTP_ERROR'});
    }
    let body;
    try { body = await response.json(); } catch { throw new OCRProviderError('La API devolvió JSON no válido.', {code:'OCR_INVALID_RESPONSE'}); }
    const pages = Array.isArray(body.ParsedResults) ? body.ParsedResults : [];
    if (body.IsErroredOnProcessing || ![1,2].includes(Number(body.OCRExitCode))) {
        const messages=Array.isArray(body.ErrorMessage)?body.ErrorMessage.join(' '):String(body.ErrorMessage||'');
        const errorCode=messages.match(/\bE\d{2,6}\b/)?.[0];
        throw new OCRProviderError('La API no pudo procesar el documento'+(errorCode?' ('+errorCode+')':'')+'. Revisa clave, cuota, tamaño y formato.', {status:422,code:errorCode||'OCR_PROCESSING_ERROR'});
    }
    if (pages.length > 3) throw new OCRProviderError('Se recibieron más de las tres páginas previstas para el plan gratuito.', {status:422,code:'OCR_PAGE_LIMIT'});
    const raw = pages.map(page=>typeof page.ParsedText==='string'?page.ParsedText:'').join('\n').trim();
    if (!raw) throw new OCRProviderError('No se obtuvo texto. Prueba una imagen más nítida.', {status:422,code:'OCR_EMPTY_TEXT'});
    const extracted = extractReceiptData(raw);
    const partial = Number(body.OCRExitCode) === 2;
    if (partial) extracted.warnings.push('La API indicó una lectura parcial. Revisa todas las páginas.');
    return {provider:'ocrspace',engine:2,partial,review_required:true,extracted};
}
