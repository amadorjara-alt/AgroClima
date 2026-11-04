import test from 'node:test';
import assert from 'node:assert/strict';
import {extractReceiptData,extractLineItems,parseAmount,isISODate,parseProviderJSON} from '../supabase/functions/_shared/receipt-parser.mjs';
import {readWithOCRSpace} from '../supabase/functions/_shared/ocr-space.mjs';
const receipt='DISTRIBUIDORA PRUEBA SAC\nRUC 20131312955\nFACTURA F001-123\nFecha: 03/11/2026\nSUB TOTAL S/ 100,00\nIGV (18%) S/ 18,00\nTOTAL S/ 118,00';
const image=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0])],{type:'image/png'});
test('extrae cantidades, unidades, presentación y precios sin mezclar el encabezado',()=>{
 const items=extractLineItems('DISTRIBUIDORA DE PRUEBA\n2 un ACEITE MARCA PRUEBA 1 L 8.50 17.00\n5 kg ARROZ DE PRUEBA 16,60 83,00\nTOTAL S/ 118.00');
 assert.equal(items.length,2);assert.equal(items[0].description,'ACEITE MARCA PRUEBA 1 L');assert.equal(items[0].quantity,2);assert.equal(items[0].unit,'un');assert.equal(items[1].unit_price,16.6);
});
test('conserva cantidades fraccionarias y deja por revisar una unidad no identificada',()=>{
 const value=extractReceiptData('TIENDA DE PRUEBA\n1,250 kg ARROZ 8.00 10.00\n2 ACEITE 1 L 8.50 17.00\nTOTAL S/ 27.00');
 assert.equal(value.items[0].quantity,1.25);assert.equal(value.items[1].unit,'');assert.ok(value.warnings.some(x=>x.includes('unidad de compra')));
});
test('una discrepancia de línea no se corrige inventando un precio o descuento',()=>{
 const value=extractReceiptData('TIENDA DE PRUEBA\n2 un ACEITE PRUEBA 8.50 16.00\nTOTAL S/ 16.00');
 assert.equal(value.items[0].unit_price,8.5);assert.equal(value.items[0].line_amount,16);assert.ok(value.warnings.some(x=>x.includes('descuentos')));
});
test('recupera RUC, número y fecha del OCR anterior',()=>{
 const value=extractReceiptData(receipt);assert.equal(value.ruc,'20131312955');assert.equal(value.number,'F001-123');assert.equal(value.date,'2026-11-03');assert.equal(value.provider,'DISTRIBUIDORA PRUEBA SAC');
});
test('no confunde SUB TOTAL con TOTAL y admite coma decimal',()=>{
 const value=extractReceiptData(receipt);assert.equal(value.subtotal,100);assert.equal(value.igv,18);assert.equal(value.total,118);
 assert.equal(parseAmount('S/ 7,60'),7.6);assert.equal(parseAmount('1.234,56'),1234.56);assert.equal(parseAmount('1,234.56'),1234.56);
});
test('no inventa totales, impuestos ni fechas',()=>{
 const value=extractReceiptData('TIENDA DE PRUEBA\nFecha: 31/02/2026\nRUC 00000000000\nCliente 1234');
 assert.equal(value.total,null);assert.equal(value.igv,null);assert.equal(value.date,'');assert.equal(value.ruc,'');assert.equal(value.currency,'');
 assert.equal(isISODate('2026-02-30'),false);
});
test('no usa un subtotal como total si falta la etiqueta de total',()=>{
 assert.equal(extractReceiptData('PRUEBA\nSUB TOTAL 120.00').total,null);
});
test('informa inconsistencias y mantiene los valores observados',()=>{
 const value=extractReceiptData(receipt.replace('118,00','130,00'));
 assert.equal(value.total,130);assert.ok(value.warnings.some(x=>x.includes('no coinciden')));
});
test('rechaza cifras ambiguas y admite JSON encerrado en un bloque de proveedor',()=>{
 assert.equal(parseAmount('1,2,3'),null);assert.equal(parseAmount('texto123'),null);
 assert.deepEqual(parseProviderJSON('```json\n{"total":118}\n```'),{total:118});
});
test('el adaptador usa la API externa, el motor gratuito y revisión obligatoria',async()=>{
 let called=false;
 const value=await readWithOCRSpace(image(),'clave-simulada',{fetchImpl:async(url,options)=>{
  called=true;assert.equal(url,'https://api.ocr.space/parse/image');assert.equal(options.body.get('OCREngine'),'2');assert.equal(options.headers.apikey,'clave-simulada');
  return Response.json({OCRExitCode:1,IsErroredOnProcessing:false,ParsedResults:[{ParsedText:receipt}]});
 }});
 assert.equal(called,true);assert.equal(value.extracted.total,118);assert.equal(value.review_required,true);
});
test('el límite de tamaño y el tipo real se comprueban antes de gastar una llamada',async()=>{
 const noCall={fetchImpl:()=>{throw Error('No debe llamarse');}};
 await assert.rejects(readWithOCRSpace(new Blob([new Uint8Array(900001)],{type:'image/png'}),'clave',noCall),e=>e.status===413);
 await assert.rejects(readWithOCRSpace(new Blob(['no-es-png'],{type:'image/png'}),'clave',noCall),e=>e.status===415);
 await assert.rejects(readWithOCRSpace(image(),'',noCall),e=>e.status===503);
});
test('HTTP 200 con error de proveedor no se presenta como éxito ni filtra la clave',async()=>{
 await assert.rejects(readWithOCRSpace(image(),'clave-simulada',{fetchImpl:async()=>Response.json({OCRExitCode:3,IsErroredOnProcessing:true,ErrorMessage:'E555 clave-simulada'})}),e=>e.status===422&&e.code==='E555'&&!e.message.includes('clave-simulada'));
});
test('la cuota, el timeout y las lecturas parciales se identifican',async()=>{
 await assert.rejects(readWithOCRSpace(image(),'clave',{fetchImpl:async()=>Response.json({},{status:429})}),e=>e.status===429);
 await assert.rejects(readWithOCRSpace(image(),'clave',{fetchImpl:async()=>{throw Error('timeout');}}),e=>e.status===504);
 const value=await readWithOCRSpace(image(),'clave',{fetchImpl:async()=>Response.json({OCRExitCode:2,IsErroredOnProcessing:false,ParsedResults:[{ParsedText:receipt}]})});
 assert.equal(value.partial,true);assert.ok(value.extracted.warnings.some(x=>x.includes('parcial')));
});
