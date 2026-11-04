import {recoverReceiptDraft} from '../supabase/functions/shared/receipt-parser.mjs';

// Mismo lector puro para los borradores del navegador y del servidor.
window.CompraSmartReceiptParser = Object.freeze({recoverReceiptDraft});
