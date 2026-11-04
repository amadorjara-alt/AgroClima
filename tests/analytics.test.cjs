const test = require('node:test');
const assert = require('node:assert/strict');
const analytics = require('../js/purchase-analytics.js');
const now = new Date('2026-11-03T17:00:00Z');
const rows = [
 {id:'a',total_amount:100,currency:'PEN',ocr_status:'completed',issue_date:'2026-11-02',created_at:'2026-11-03T10:00:00Z'},
 {id:'b',total_amount:20,currency:'USD',ocr_status:'completed',issue_date:'2026-11-01',created_at:'2026-11-03T10:00:00Z'},
 {id:'c',total_amount:900,currency:'PEN',ocr_status:'failed',created_at:'2026-11-03T10:00:00Z'},
 {id:'d',total_amount:1000,currency:'PEN',ocr_status:'pending',created_at:'2026-11-03T10:00:00Z'},
];
test('los importes se separan por moneda y excluyen errores y pendientes',()=>{
 assert.deepEqual(analytics.summary(rows).totals,{PEN:100,USD:20});
 assert.deepEqual(analytics.summary(rows).statuses,{pending:1,processing:0,review:0,completed:2,failed:1,other:0});
});
test('un documento sin moneda no se transforma en soles',()=>{
 assert.deepEqual(analytics.summary([{ocr_status:'completed',total_amount:50}]).totals,{UNKNOWN:50});
});
test('se rechazan importes vacíos, infinitos y negativos',()=>{
 for(const value of [null,'',NaN,Infinity,-1])assert.equal(analytics.amount(value),null);
 assert.equal(analytics.amount(0),0);
});
test('el periodo utiliza la fecha del comprobante y separa las series',()=>{
 const s=analytics.monthlySeries(rows,{now});
 assert.deepEqual(s.keys,['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']);
 assert.deepEqual(s.datasets,[{currency:'PEN',values:[0,0,0,0,0,100]},{currency:'USD',values:[0,0,0,0,0,20]}]);
});
test('no convierte fechas inexistentes ni desplaza un día ISO a otra fecha',()=>{
 assert.equal(analytics.dayKey('2026-02-30'),'');assert.equal(analytics.dayKey('2026-11-03'),'2026-11-03');
 assert.equal(analytics.dayKey('2026-11-01T02:00:00Z'),'2026-10-31');
});
test('la evolución excluye facturas futuras y periodos antiguos',()=>{
 const future={...rows[0],issue_date:'2026-12-01'}, old={...rows[0],issue_date:'2020-01-01'};
 assert.equal(analytics.monthlySeries([future,old],{now}).datasets.length,0);
});
test('compara solo facturas del negocio actual y conserva la última referencia por proveedor',()=>{
 const input=[
  {id:'1',invoice_id:'a',product_id:'p',supplier_id:'s',unit_price:9,recorded_at:'2026-10-25T12:00:00Z'},
  {id:'2',invoice_id:'a',product_id:'p',supplier_id:'s',unit_price:12,recorded_at:'2026-11-02T12:00:00Z'},
  {id:'3',invoice_id:'otro-negocio',product_id:'p',supplier_id:'s',unit_price:1,recorded_at:'2026-11-03T12:00:00Z'},
  {id:'4',invoice_id:'c',product_id:'p',supplier_id:'s2',unit_price:2,recorded_at:'2026-11-03T12:00:00Z'},
  {id:'5',invoice_id:'b',product_id:'p',supplier_id:'s',unit_price:3,recorded_at:'2026-11-02T12:00:00Z'},
 ];
 const offers=analytics.recentOffers(input,rows,{now});
 assert.equal(offers.length,2);assert.equal(offers.find(x=>x.currency==='PEN').unit_price,12);assert.equal(offers.find(x=>x.currency==='USD').unit_price,3);
});
test('excluye referencias futuras, caducadas y sin precio válido',()=>{
 const record={invoice_id:'a',product_id:'p',supplier_id:'s',unit_price:10};
 assert.equal(analytics.recentOffers([{...record,recorded_at:'2026-11-04'},{...record,recorded_at:'2020-01-01'},{...record,unit_price:-1,recorded_at:now}],rows,{now}).length,0);
});
