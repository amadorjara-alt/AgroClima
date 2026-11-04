import test from 'node:test';
import assert from 'node:assert/strict';
import {extractReceiptData,extractLineItems,recoverReceiptDraft} from '../supabase/functions/_shared/receipt-parser.mjs';
import {sunatText,legacySunatDraft} from './fixtures/sunat-receipt.mjs';

test('SUNAT: reconoce valor unitario de cuatro decimales sin confundir ICBPER con el importe',()=>{
 const result=extractReceiptData(sunatText);assert.equal(result.items.length,1);
 assert.equal(result.items[0].unit_price,123.4567);assert.equal(result.items[0].line_amount,123.46);assert.equal(result.items[0].unit,'un');
 assert.equal(result.subtotal,123.46);assert.equal(result.igv,22.22);assert.equal(result.total,145.68);
 assert.equal(result.provider,'PROVEEDOR FICTICIO E.I.R.L.');assert.equal(result.number,'E001-9999');
 assert.ok(result.warnings.some(w=>w.includes('calculado como cantidad')));
});
test('SUNAT: conserva una columna explícita de importe y advierte de ICBPER adicional',()=>{
 const result=extractReceiptData('Cantidad\tUnidad\tDescripción\tValor Unitario\tImporte\tICBPER\n2\tUNIDAD\tPRODUCTO FICTICIO\t4.20\t8.40\t1.00\nTOTAL S/ 9.40');
 assert.equal(result.items.length,1);assert.equal(result.items[0].line_amount,8.4);assert.equal(result.items[0].line_amount_source,undefined);
 assert.ok(result.warnings.some(w=>w.includes('ICBPER')));
});
test('SUNAT: respeta el orden de las columnas y los decimales con coma',()=>{
 const items=extractLineItems('Descripción\tCantidad\tUnidad Medida\tICBPER\tValor Unitario\nPRODUCTO FICTICIO\t2,00\tUNIDAD\t0,00\t123,4567\nSub Total Ventas :\t246,91');
 assert.equal(items.length,1);assert.equal(items[0].quantity,2);assert.equal(items[0].unit_price,123.4567);assert.equal(items[0].line_amount,246.91);
});
test('SUNAT: filas incompletas o precios ambiguos no se convierten en productos válidos',()=>{
 const header='Cantidad\tUnidad\tDescripción\tValor Unitario\tICBPER\n';
 for(const line of ['1\tUNIDAD\tDEMO\t123.456\t0.00','1\tUNIDAD\tDEMO\t\t0.00','0\tUNIDAD\tDEMO\t10.00\t0.00'])assert.equal(extractLineItems(header+line).length,0);
 assert.ok(extractReceiptData(header).warnings.some(w=>w.includes('No se identificaron los productos')));
});
test('recupera un borrador anterior desde el texto ya guardado sin modificar el original',()=>{
 const before=JSON.stringify(legacySunatDraft),result=recoverReceiptDraft(legacySunatDraft);
 assert.equal(result.items.length,1);assert.equal(result.items[0].unit_price,123.4567);assert.equal(result.number,'E001-9999');assert.equal(result.subtotal,123.46);
 assert.equal(result.items[0].line_amount+result.igv,result.total);assert.equal(result.rawText,legacySunatDraft.rawText);assert.equal(JSON.stringify(legacySunatDraft),before);
});
test('conserva líneas existentes y las correcciones ya presentes del usuario',()=>{
 const edited={...legacySunatDraft,items:[{description:'Corrección de prueba',quantity:2,unit:'un',unit_price:5,line_amount:10}],total:10,igv:0};
 assert.equal(recoverReceiptDraft(edited),edited);
});
