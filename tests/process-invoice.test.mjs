import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createInvoiceHandler} from '../supabase/functions/_shared/process-invoice.mjs';
import {encryptSecret,encodeBase64} from '../supabase/functions/_shared/credentials.mjs';
const image=await readFile(new URL('./fixtures/receipt-demo.png',import.meta.url));
const user='qa-user',business='qa-business',path=`${user}/${business}/receipt.png`;
function harness(options={}){
 const calls=[],row={id:'qa-invoice',user_id:user,business_id:business,file_path:path,ocr_status:'pending',...options.row};
 const environment={SUPABASE_URL:'https://qa.example.invalid',SUPABASE_ANON_KEY:'public-ficticia',SUPABASE_SERVICE_ROLE_KEY:'solo-servidor-ficticia',OCR_SPACE_API_KEY:'ocr-ficticia-no-real',...options.environment};
 let providerCalls=0;
 function query(table,admin){
  let action='select';const filters=[];let data;
  const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},update(value){action='update';data=value;return q;},
   maybeSingle:async()=>{calls.push({table,admin,action,filters:[...filters],data});
    if(table==='invoices')return {data:action==='update'?{id:row.id}:options.missingInvoice?null:row,error:null};
    if(table==='businesses')return{data:options.missingBusiness?null:{id:business},error:null};
    if(table==='integration_credentials')return{data:options.credential||null,error:null};
    return{data:null,error:null};},
   then(resolve,reject){calls.push({table,admin,action,filters:[...filters],data});return (options.outcomeError&&table==='ocr_requests'&&data?.outcome==='review'?Promise.reject(Error('sin red al registrar intento')):Promise.resolve({data:null,error:null})).then(resolve,reject);}
  };return q;
 }
 const createClient=(_url,key)=>{
  const admin=key===environment.SUPABASE_SERVICE_ROLE_KEY;
  return{auth:{getUser:async()=>({data:{user:options.invalidSession?null:{id:user}},error:options.invalidSession?{message:'bad'}:null})},
   from:table=>query(table,admin),
   rpc:async(name,args)=>{calls.push({name,args,admin});return{data:{request_id:'qa-request'},error:options.claimError||null};},
   storage:{from:()=>({download:async p=>{calls.push({download:p,admin});return{data:options.downloadError?null:new Blob([image],{type:'image/png'}),error:options.downloadError?{}:null};}})}
  };
 };
 const fetchImpl=async(url,config)=>{
  providerCalls++;calls.push({url,apiKey:config.headers.apikey});
  if(options.networkError)throw Error('sin red');
  return new Response(JSON.stringify(options.providerBody||{OCRExitCode:1,IsErroredOnProcessing:false,ParsedResults:[{ParsedText:'PROVEEDOR FICTICIO\nFECHA 03/11/2026\n2 un Aceite 1 L 10.00 20.00\nTOTAL PEN 20.00'}]}),{status:options.providerStatus||200});
 };
 const handler=createInvoiceHandler({createClient,env:name=>environment[name],fetchImpl});
 const request=async(body={file_path:path},{auth=true,raw=false,method='POST'}={})=>{
  const r=await handler(new Request('https://qa.example.invalid/process-invoice',{method,headers:auth?{Authorization:'Bearer token-ficticio'}:{},...(method==='POST'?{body:raw?body:JSON.stringify(body)}:{})}));
  return{status:r.status,body:await r.json()};
 };
 return{request,calls,providerCalls:()=>providerCalls};
}
test('sin sesión o con sesión inválida no se consulta la bóveda ni el proveedor',async()=>{
 for(const invalid of [false,true]){const h=harness({invalidSession:invalid});const r=await h.request(undefined,{auth:invalid});assert.equal(r.status,401);assert.equal(h.calls.length,0);}
});
test('JSON inválido y ruta ajena se rechazan antes de consultar documentos',async()=>{
 const h=harness();assert.equal((await h.request('{',{raw:true})).status,400);
 for(const file_path of ['otra-persona/archivo.png',`${user}/${business}/../x`])assert.equal((await h.request({file_path})).status,400);
 assert.equal(h.providerCalls(),0);assert.equal(h.calls.length,0);
});
test('la factura y el negocio deben pertenecer al usuario autenticado',async()=>{
 for(const options of [{missingInvoice:true},{missingBusiness:true}]){
  const h=harness(options);const r=await h.request();assert.ok([403,404].includes(r.status));assert.equal(h.providerCalls(),0);
  assert.equal(h.calls.some(c=>c.admin),false);
 }
});
test('una clave ausente produce un error accionable sin marcar la factura como fallida',async()=>{
 const h=harness({environment:{OCR_SPACE_API_KEY:''}}),r=await h.request();assert.equal(r.status,503);assert.equal(r.body.code,'OCR_KEY_MISSING');
 assert.equal(h.providerCalls(),0);assert.equal(h.calls.some(c=>c.action==='update'),false);
});
test('un borrador guardado se recupera sin gastar otra solicitud de API',async()=>{
 const h=harness({row:{ocr_status:'review',ocr_draft:{provider:'Ficticio',total:20}}}),r=await h.request();
 assert.equal(r.body.cached,true);assert.equal(r.body.review_required,true);assert.equal(h.providerCalls(),0);assert.equal(h.calls.some(c=>c.admin),false);
});
test('un comprobante confirmado no se procesa de nuevo',async()=>{
 const h=harness({row:{confirmed_at:'2026-11-03T17:00:00Z'}}),r=await h.request();assert.equal(r.body.confirmed,true);assert.equal(h.providerCalls(),0);
});
test('el proveedor se invoca y solo se guarda un borrador, protegido por usuario y reserva',async()=>{
 const h=harness(),r=await h.request();assert.equal(r.status,200);assert.equal(r.body.review_required,true);assert.equal(r.body.provider,'ocrspace');
 assert.equal(h.providerCalls(),1);const save=h.calls.find(c=>c.table==='invoices'&&c.action==='update');assert.equal(save.data.ocr_status,'review');
 assert.ok(save.filters.some(([k,v])=>k==='user_id'&&v===user));assert.ok(save.filters.some(([k,v])=>k==='ocr_request_id'&&v==='qa-request'));
 assert.equal(h.calls.some(c=>['invoice_items','products','price_history'].includes(c.table)),false);assert.ok(!JSON.stringify(r.body).includes('ocr-ficticia'));
});
test('la clave cifrada se lee solo para el propietario y no sale en la respuesta',async()=>{
 const master=encodeBase64(crypto.getRandomValues(new Uint8Array(32))),credential=await encryptSecret('clave-privada-ficticia',master);
 const h=harness({credential,environment:{CREDENTIALS_ENCRYPTION_KEY:master}}),r=await h.request();
 assert.equal(r.status,200);assert.equal(h.calls.find(c=>c.url).apiKey,'clave-privada-ficticia');
 assert.ok(h.calls.find(c=>c.table==='integration_credentials').filters.some(([k,v])=>k==='user_id'&&v===user));
 assert.ok(!JSON.stringify(r.body).includes('clave-privada-ficticia'));
});
test('un fallo del registro de intentos no descarta un borrador que ya se guardó',async()=>{
 const h=harness({outcomeError:true}),r=await h.request();assert.equal(r.status,200);assert.equal(r.body.success,true);
 assert.equal(h.calls.some(c=>c.table==='invoices'&&c.data?.ocr_status==='failed'),false);
});
test('un fallo de cifrado no provoca rotación ni usa silenciosamente otra clave',async()=>{
 const h=harness({credential:{encrypted_key:'no-cifrado',iv:'incorrecto'}}),r=await h.request();assert.equal(r.status,503);assert.equal(r.body.code,'OCR_VAULT_ERROR');assert.equal(h.providerCalls(),0);
});
test('los límites de cuota y procesamiento concurrente se distinguen y evitan la API',async()=>{
 for(const [message,status]of [['OCR_BUSY',409],['OCR_QUOTA',429]]){const h=harness({claimError:{message}});assert.equal((await h.request()).status,status);assert.equal(h.providerCalls(),0);}
});
test('un error real del proveedor marca el intento y no devuelve secretos',async()=>{
 const h=harness({providerStatus:429}),r=await h.request();assert.equal(r.status,429);assert.equal(r.body.code,'OCR_HTTP_ERROR');
 assert.equal(h.calls.find(c=>c.table==='invoices'&&c.action==='update').data.ocr_status,'failed');assert.ok(!JSON.stringify(r.body).includes('ficticia'));
});
