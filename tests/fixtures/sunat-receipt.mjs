// Documento totalmente ficticio para reproducir el formato de columnas SUNAT.
export const sunatText=[
 'PROVEEDOR FICTICIO E.I.R.L.\tFACTURA ELECTRONICA\t',
 'RUC: 00000000000\t',
 'E001-9999\t',
 'Fecha de Emisión\t: 03/11/2026\tForma de pago: Contado\t',
 'Tipo de Moneda\t: SOLES\t',
 'Cantidad\tUnidad Medida\tDescripción\tValor Unitario\tICBPER\t',
 '1.00\tUNIDAD\tBATERIA PORTATIL DEMO 20000MAH\t123.4567\t0.00\t',
 'Sub Total Ventas :\tS/123.46\t',
 'IGV :\tS/ 22.22\t',
 'SON: CIENTO CUARENTA Y CINCO Y 00/100 SOLES\t',
 'Importe Total :\tS/ 145.68\t'
].join('\r\n');
export const legacySunatDraft={provider:'PROVEEDOR FICTICIO E.I.R.L. FACTURA ELECTRONICA',ruc:'',number:'',date:'2026-11-03',currency:'PEN',subtotal:null,igv:22.22,total:145.68,items:[],rawText:sunatText,warnings:[]};
