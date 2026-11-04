import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import analytics from '../js/purchase-analytics.js';

const USER='qa-user', BUSINESS='qa-business';
const fixtureBusiness={id:BUSINESS,user_id:USER,business_name:'Negocio ficticio de prueba',owner_name:'Persona de prueba'};
async function source(path){return readFile(new URL('../'+path,import.meta.url),'utf8');}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(setImmediate);}throw Error('La vista no terminó de inicializarse.');}
function clientFor(tables,credentials=new Map(),services){
 const calls=[];
 const client={
  auth:{getSession:async()=>({data:{session:{access_token:'session-ficticia'}}}),getUser:async()=>({data:{user:{id:USER,email:'qa@example.invalid',user_metadata:{}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  functions:{invoke:async(name,{body})=>{
   calls.push({name,body});
   if(body.action==='list')return{data:{success:true,integrations:[...credentials.values()],services}};
   if(body.action==='save'){credentials.set(body.provider,{provider:body.provider,model:body.model});return{data:{success:true,saved:true}};}
   if(body.action==='delete'){credentials.delete(body.provider);return{data:{success:true}};}
   throw Error('Operación de prueba no prevista');
  }},
  from(name){
   let rows=[...(tables[name]||[])],head=false;
   const query={
    select(_columns,options){head=Boolean(options?.head);return query;},
    eq(field,value){rows=rows.filter(row=>row[field]===value);return query;},
    order(){return query;},limit(value){rows=rows.slice(0,value);return query;},
    maybeSingle:async()=>({data:rows[0]||null,error:null}),single:async()=>({data:rows[0]||null,error:null}),
    then(resolve,reject){return Promise.resolve({data:head?null:rows,count:rows.length,error:null}).then(resolve,reject);},
   };
   return query;
  },
 };
 return {client,calls};
}
async function integrationPage(credentials,services){
 const html=await source('integrations.html'),code=await source('js/integrations.js');
 const {client,calls}=clientFor({businesses:[fixtureBusiness]},credentials,services);
 const dom=new JSDOM(html,{url:'https://grupo.example/integrations.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 dom.window.supabaseClient=client;
 dom.window.CompraSmart={getSupabaseClient:()=>client,showToast(){}};
 dom.window.confirm=()=>true;
 dom.window.eval(code);
 await until(()=>dom.window.CompraSmartIntegrations?.getStates().gemini==='configured');
 return {dom,calls,api:dom.window.CompraSmartIntegrations};
}
test('una credencial guardada sigue configurada tras recargar, sin declararse verificada',async()=>{
 const credentials=new Map([['gemini',{provider:'gemini',model:'modelo-del-grupo'}]]);
 let page=await integrationPage(credentials);
 assert.equal(page.api.getStates().gemini,'configured');
 assert.match(page.dom.window.document.getElementById('status-gemini').textContent,/pendiente de prueba/);
 assert.equal(page.dom.window.document.getElementById('configuredIntegrations').textContent,'1');
 page.api.openModal('gemini');
 assert.equal(page.dom.window.document.getElementById('modelName').value,'modelo-del-grupo');
 assert.equal(page.dom.window.document.getElementById('apiKey').value,'');
 assert.equal(page.dom.window.document.getElementById('apiKey').required,false);
 page.api.closeModal();page.dom.window.close();
 page=await integrationPage(credentials);
 assert.equal(page.api.getStates().gemini,'configured');assert.equal(credentials.size,1);
 assert.equal(page.dom.window.localStorage.length,0);
 page.dom.window.close();
});
test('editar el modelo no exige reintroducir ni borrar la clave; eliminarla requiere la acción explícita',async()=>{
 const credentials=new Map([['gemini',{provider:'gemini',model:'modelo-anterior'}]]),page=await integrationPage(credentials);
 const {document,Event}=page.dom.window;
 page.api.openModal('gemini');document.getElementById('modelName').value='modelo-nuevo';
 document.getElementById('integrationForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>page.calls.some(call=>call.body.action==='save'));
 assert.equal(page.calls.find(call=>call.body.action==='save').body.apiKey,'');
 assert.equal(page.api.getStates().gemini,'configured');
 assert.equal(page.calls.some(call=>call.body.action==='delete'),false);
 page.api.openModal('gemini');document.getElementById('deleteIntegration').click();
 await until(()=>page.api.getStates().gemini==='pending');
 assert.equal(credentials.size,0);assert.equal(page.calls.filter(call=>call.body.action==='delete').length,1);
 page.dom.window.close();
});
test('OCR.space tiene una configuración propia y guardar la clave no simula una conexión verificada',async()=>{
 const credentials=new Map([['gemini',{provider:'gemini',model:'configuración-anterior'}]]),p=await integrationPage(credentials);
 p.api.openModal('ocrspace');const d=p.dom.window.document;
 assert.equal(d.getElementById('apiKey').required,true);assert.ok(p.api.getProviders().ocrspace);
 d.getElementById('apiKey').value='clave-ficticia-ocrspace';d.getElementById('integrationForm').dispatchEvent(new p.dom.window.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>p.api.getStates().ocrspace==='configured');
 assert.equal(p.calls.find(c=>c.body.action==='save').body.provider,'ocrspace');assert.equal(p.api.getStates().gemini,'configured');
 assert.equal(d.getElementById('apiKey').value,'');assert.equal(p.dom.window.localStorage.length,0);p.dom.window.close();
});
test('la clave compartida del proyecto se muestra configurada sin exigir otra clave personal ni fingir una prueba',async()=>{
 const credentials=new Map([['gemini',{provider:'gemini',model:'modelo-anterior'}]]);
 const p=await integrationPage(credentials,{ocrspace:{configured:true,source:'project'}}),d=p.dom.window.document;
 assert.equal(p.api.getStates().ocrspace,'configured');assert.match(d.getElementById('status-ocrspace').textContent,/Clave del proyecto guardada.*prueba pendiente/);
 p.api.openModal('ocrspace');assert.match(d.getElementById('modalDescription').textContent,/No es necesario volver a introducirla/);
 assert.equal(d.getElementById('deleteIntegration').hidden,true);assert.equal(p.calls.some(c=>c.body.action==='save'),false);p.dom.window.close();
});
test('el dashboard muestra monedas separadas y tres gráficos con datos simulados identificados',async()=>{
 const html=await source('dashboard.html'),analyticsCode=await source('js/purchase-analytics.js'),dashboardCode=await source('js/dashboard.js');
 const now=new Date().toISOString();
 const invoiceDay=analytics.dayKey(new Date());
 const rows=[
  {id:'one',user_id:USER,business_id:BUSINESS,total_amount:118,currency:'PEN',ocr_status:'completed',issue_date:invoiceDay,created_at:now},
  {id:'two',user_id:USER,business_id:BUSINESS,total_amount:10,currency:'USD',ocr_status:'completed',issue_date:invoiceDay,created_at:now},
  {id:'three',user_id:USER,business_id:BUSINESS,total_amount:900,currency:'PEN',ocr_status:'failed',created_at:now},
 ];
 const {client}=clientFor({businesses:[fixtureBusiness],invoices:rows,products:[{id:'p',user_id:USER,business_id:BUSINESS,name:'Producto ficticio',category:'Prueba',unit:'un'}],suppliers:[],price_history:[]},new Map(),{ocrspace:{configured:true,source:'project'}});
 const messages=[],charts=[];
 const errors=[];
 const virtualConsole=new VirtualConsole();
 virtualConsole.on('jsdomError',error=>errors.push(error.message));
 virtualConsole.on('error',(...items)=>errors.push(items.map(x=>x?.message||String(x)).join(' ')));
 const dom=new JSDOM(html,{url:'https://grupo.example/dashboard.html',runScripts:'outside-only',virtualConsole});
 dom.window.CompraSmart={getSupabaseClient:()=>client,showToast:(message,type)=>messages.push({message,type})};
 dom.window.Chart=class{constructor(_canvas,config){charts.push(config);}destroy(){}};
 dom.window.eval(analyticsCode);
 dom.window.eval(dashboardCode);
 await until(()=>(charts.length===3&&dom.window.document.getElementById('ocrspaceIntegrationStatus').textContent.includes('Clave guardada'))||messages.some(x=>x.type==='error')).catch(()=>{throw Error(JSON.stringify({errors,messages,charts:charts.length}));});
 assert.deepEqual(messages.filter(x=>x.type==='error'),[]);
 const total=dom.window.document.getElementById('overviewPurchaseTotal').textContent;
 assert.match(total,/118/);assert.match(total,/10/);assert.doesNotMatch(total,/1028/);
 assert.equal(dom.window.document.getElementById('historyPurchaseAmount').textContent,total);
 assert.deepEqual(charts.map(x=>x.type).sort(),['bar','doughnut','line']);
 const line=charts.find(x=>x.type==='line');
 assert.deepEqual(Array.from(line.data.datasets,d=>d.currency).sort(),['PEN','USD']);
 assert.equal(line.data.datasets.find(d=>d.currency==='PEN').data.at(-1),118);
 assert.match(dom.window.document.getElementById('supabaseIntegrationStatus').textContent,/Conectado/);
 assert.match(dom.window.document.getElementById('ocrspaceIntegrationStatus').textContent,/secretos del proyecto.*prueba/);
 assert.match(dom.window.document.getElementById('ocrIntegrationStatus').textContent,/Todavía sin lecturas/);
 assert.doesNotMatch(dom.window.document.getElementById('view-integrations').textContent,/Gemini/);
 dom.window.scrollTo=()=>{};dom.window.document.querySelector('[data-view="integrations"]').click();
 assert.equal(dom.window.document.getElementById('pageTitle').textContent,'Integraciones');
 dom.window.close();
});
