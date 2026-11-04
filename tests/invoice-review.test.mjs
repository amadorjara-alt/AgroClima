import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {recoverReceiptDraft} from '../supabase/functions/_shared/receipt-parser.mjs';
import {legacySunatDraft} from './fixtures/sunat-receipt.mjs';
const code=await readFile(new URL('../js/invoice-review.js',import.meta.url),'utf8');
const draft={provider:'Proveedor ficticio',ruc:'',number:'QA-1',date:'2026-11-03',currency:'PEN',total:23.6,igv:3.6,
 items:[{description:'Aceite 1 L',quantity:2,unit:'un',unit_price:10,line_amount:20}],warnings:[],rawText:'DOCUMENTO FICTICIO'};
function page(onConfirm=async()=>{},reviewDraft=draft){
 const dom=new JSDOM('<div id="review" hidden></div>',{runScripts:'outside-only'});dom.window.eval(code);dom.window.CompraSmartReceiptParser={recoverReceiptDraft};
 const container=dom.window.document.getElementById('review');
 const form=dom.window.CompraSmartInvoiceReview.mount({container,invoiceId:'qa-invoice',draft:reviewDraft,onConfirm});
 return {dom,form,container};
}
async function turn(){await new Promise(setImmediate);}
test('el borrador se hace visible y los datos OCR se muestran sin ejecutar HTML',()=>{
 const p=page();assert.equal(p.container.hidden,false);assert.equal(p.form.elements.namedItem('tax_amount').value,'3.6');
 const dangerous={...draft,provider:'<img src=x onerror=alert(1)>',rawText:'<script>window.pwned=true</script>'};
 p.dom.window.CompraSmartInvoiceReview.mount({container:p.container,invoiceId:'qa',draft:dangerous,onConfirm:async()=>{}});
 assert.equal(p.container.querySelector('img'),null);assert.equal(p.container.querySelector('script'),null);assert.equal(p.dom.window.pwned,undefined);p.dom.window.close();
});
test('una suma incoherente no llama al guardado',async()=>{
 let calls=0;const p=page(async()=>{calls++;});p.form.elements.namedItem('total_amount').value='500';
 p.form.dispatchEvent(new p.dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();assert.equal(calls,0);assert.match(p.form.textContent,/deben coincidir/);p.dom.window.close();
});
test('se confirma una sola vez aun si se envía dos veces el formulario',async()=>{
 const calls=[];let release;const pending=new Promise(resolve=>release=resolve);
 const p=page(async(...args)=>{calls.push(args);await pending;});
 const submit=()=>p.form.dispatchEvent(new p.dom.window.Event('submit',{bubbles:true,cancelable:true}));submit();submit();
 assert.equal(calls.length,1);assert.equal(calls[0][0],'qa-invoice');assert.equal(calls[0][1].items[0].description,'Aceite 1 L');
 release();await turn();assert.match(p.form.textContent,/Compra guardada/);submit();assert.equal(calls.length,1);p.dom.window.close();
});
test('un error del servidor conserva el formulario editable para corregirlo',async()=>{
 const p=page(async()=>{throw Error('Número duplicado');});p.form.dispatchEvent(new p.dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();
 assert.match(p.form.textContent,/Número duplicado/);assert.equal(p.form.querySelector('[type=submit]').disabled,false);p.dom.window.close();
});
test('recalcular una cantidad conserva una presentación explícita y actualiza su importe',()=>{
 const p=page();const input=p.form.querySelector('[data-field=quantity]');input.value='3';input.dispatchEvent(new p.dom.window.Event('input'));
 assert.equal(p.form.querySelector('[data-field=subtotal]').value,'30.00');assert.equal(p.form.querySelector('[data-field=description]').value,'Aceite 1 L');p.dom.window.close();
});

test('un borrador SUNAT antiguo recupera la fila y permite confirmar con su precio exacto',async()=>{
 const calls=[],p=page(async(...args)=>{calls.push(args);},legacySunatDraft);
 assert.equal(p.form.querySelectorAll('tbody tr').length,1);
 assert.equal(p.form.querySelector('[data-field=unit_price]').value,'123.4567');
 assert.equal(p.form.querySelector('[data-field=subtotal]').value,'123.46');
 assert.match(p.form.querySelector('[data-review-totals]').textContent,/Coincide con el total/);
 p.form.dispatchEvent(new p.dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();
 assert.equal(calls.length,1);assert.equal(calls[0][1].items[0].unit_price,123.4567);assert.equal(calls[0][1].total_amount,145.68);
 assert.match(p.form.textContent,/Compra guardada/);p.dom.window.close();
});
test('sin productos reconocidos ofrece una fila editable y exige datos reales antes de guardar',async()=>{
 let calls=0;const p=page(async()=>{calls++;},{...draft,items:[],rawText:'DOCUMENTO FICTICIO SIN DETALLE'});
 const tr=p.form.querySelector('tbody tr');assert.ok(tr);assert.equal(tr.querySelector('[data-field=description]').value,'');
 assert.equal(tr.querySelector('[data-field=unit_price]').value,'');assert.equal(p.form.querySelector('[data-review-empty]').hidden,false);
 p.form.dispatchEvent(new p.dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();assert.equal(calls,0);
 tr.querySelector('[data-field=description]').value='Producto introducido en la prueba';tr.querySelector('[data-field=unit]').value='un';
 const price=tr.querySelector('[data-field=unit_price]');price.value='20';price.dispatchEvent(new p.dom.window.Event('input',{bubbles:true}));
 p.form.dispatchEvent(new p.dom.window.Event('submit',{bubbles:true,cancelable:true}));await turn();assert.equal(calls,1);p.dom.window.close();
});
