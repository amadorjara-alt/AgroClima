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
 const html=await source('dashboard.html'),analyticsCode=await source('js/purchase-analytics.js'),resetCode=await source('js/history-reset.js'),dashboardCode=await source('js/dashboard.js');
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
 dom.window.eval(resetCode);
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

test('reiniciar desde el dashboard actualiza facturas, historial, importes y comparaciones',async()=>{
 const [analyticsCode,resetCode,dashboardCode]=await Promise.all([source('js/purchase-analytics.js'),source('js/history-reset.js'),source('js/dashboard.js')]);
 const now=new Date().toISOString(),tables={businesses:[fixtureBusiness],suppliers:[],products:[],price_history:[],
  invoices:[{id:'fixture-invoice',user_id:USER,business_id:BUSINESS,total_amount:118,currency:'PEN',ocr_status:'completed',created_at:now},
   {id:'other-business-invoice',user_id:USER,business_id:'other-business',total_amount:999,currency:'PEN',ocr_status:'completed',created_at:now}]};
 const {client,calls}=clientFor(tables,new Map(),{ocrspace:{configured:true,source:'project'}});
 client.rpc=async(name,args)=>{
  calls.push({name,args});assert.equal(name,'reset_purchase_history');assert.equal(args.p_business_id,BUSINESS);
  assert.deepEqual(Array.from(args.p_invoice_ids),['fixture-invoice']);
  tables.invoices=tables.invoices.filter(row=>!args.p_invoice_ids.includes(row.id));
  return{data:{success:true,deleted_invoices:1}};
 };
 const messages=[],dom=new JSDOM(await source('dashboard.html'),{url:'https://grupo.example/dashboard.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const d=dom.window.document,dialog=d.getElementById('resetHistoryDialog');
 dialog.showModal=()=>dialog.setAttribute('open','');dialog.close=()=>dialog.removeAttribute('open');
 dom.window.CompraSmart={getSupabaseClient:()=>client,showToast:(message,type)=>messages.push({message,type})};
 dom.window.eval(analyticsCode);dom.window.eval(resetCode);dom.window.eval(dashboardCode);
 await until(()=>d.getElementById('historyPurchaseCount').textContent==='1'&&!d.getElementById('resetHistoryButton').disabled);
 d.getElementById('resetHistoryButton').click();d.getElementById('resetHistoryConfirmation').value='ELIMINAR';
 d.getElementById('resetHistoryConfirmation').dispatchEvent(new dom.window.Event('input'));
 d.getElementById('resetHistoryForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>d.getElementById('historyResetNotice').textContent.includes('Historial reiniciado'));
 assert.equal(d.getElementById('historyPurchaseCount').textContent,'0');
 assert.doesNotMatch(d.getElementById('overviewPurchaseTotal').textContent,/118|999/);
 assert.match(d.getElementById('invoicesTableBody').textContent,/Todavía no hay facturas/);
 assert.match(d.getElementById('historyTableBody').textContent,/Todavía no hay compras/);
 assert.match(d.getElementById('comparisonResults').textContent,/Aún no hay precios comparables/);
 assert.equal(tables.invoices.length,1);assert.equal(tables.invoices[0].business_id,'other-business');
 assert.equal(d.querySelectorAll('#historyTable thead th').length,5);
 assert.deepEqual(messages.filter(item=>item.type==='error'),[]);dom.window.close();
});

test('menú móvil visible, cierre con Escape/fondo y navegación sin bloquear el contenido',async()=>{
 const [html,analyticsCode,dashboardCode]=await Promise.all([source('dashboard.html'),source('js/purchase-analytics.js'),source('js/dashboard.js')]);
 const {client}=clientFor({businesses:[fixtureBusiness]},new Map(),{});
 const dom=new JSDOM(html,{url:'https://grupo.example/dashboard.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document;let changed;
 const media={matches:true,addEventListener:(_name,callback)=>{changed=callback;}};
 w.matchMedia=()=>media;w.scrollTo=()=>{};w.CompraSmart={getSupabaseClient:()=>client,showToast(){}};
 w.eval(analyticsCode);w.eval(dashboardCode);
 await until(()=>d.getElementById('supabaseIntegrationStatus').textContent.includes('Conectado'));
 const button=d.getElementById('mobileMenuButton'),sidebar=d.getElementById('sidebar'),backdrop=d.getElementById('mobileMenuBackdrop'),main=d.querySelector('.dashboard-main');
 button.focus();button.click();
 assert.equal(sidebar.classList.contains('open'),true);assert.equal(backdrop.hidden,false);assert.equal(main.inert,true);
 assert.equal(button.getAttribute('aria-expanded'),'true');assert.equal(sidebar.getAttribute('aria-hidden'),'false');
 assert.equal(d.activeElement.id,'mobileMenuClose');
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(backdrop.hidden,true);assert.equal(main.inert,false);assert.equal(d.activeElement,button);
 button.click();backdrop.click();assert.equal(button.getAttribute('aria-expanded'),'false');
 button.click();d.querySelector('[data-view="products"]').click();
 assert.equal(d.getElementById('view-products').classList.contains('active'),true);
 assert.equal(sidebar.classList.contains('open'),false);assert.equal(main.inert,false);assert.equal(w.location.hash,'#view-products');
 button.click();media.matches=false;changed();
 assert.equal(main.inert,false);assert.equal(sidebar.inert,false);assert.equal(sidebar.hasAttribute('aria-hidden'),false);assert.equal(backdrop.hidden,true);
 dom.window.close();
});

test('una sola búsqueda filtra las compras y muestra fuentes de Internet dentro del dashboard',async()=>{
 const [html,analyticsCode,searchCode,dashboardCode]=await Promise.all([source('dashboard.html'),source('js/purchase-analytics.js'),source('js/product-search.js'),source('js/dashboard.js')]);
 const now=new Date().toISOString(),tables={businesses:[fixtureBusiness],suppliers:[],
  invoices:[{id:'invoice',user_id:USER,business_id:BUSINESS,currency:'PEN',ocr_status:'completed',created_at:now}],
  products:[{id:'rice',user_id:USER,business_id:BUSINESS,name:'Arroz de prueba',unit:'kg'},{id:'oil',user_id:USER,business_id:BUSINESS,name:'Aceite de prueba',unit:'L'}],
  price_history:[{id:'a',user_id:USER,product_id:'rice',supplier_id:'supplier',invoice_id:'invoice',unit_price:5,recorded_at:now},{id:'b',user_id:USER,product_id:'oil',supplier_id:'supplier',invoice_id:'invoice',unit_price:9,recorded_at:now}]};
 const {client,calls}=clientFor(tables,new Map(),{}),originalInvoke=client.functions.invoke;
 client.functions.invoke=async(name,args)=>name==='search-products'?(calls.push({name,...args}),{data:{success:true,fetched_at:now,results:[
  {title:'Fuente ficticia para la prueba <img src=x onerror=alert(1)>',url:'https://fuente.example.invalid/arroz',content:'Contenido de prueba, no es una cotización real.'},
  {title:'Enlace inválido',url:'javascript:alert(1)',content:'No debe mostrarse'}
 ]}}):originalInvoke(name,args);
 const dom=new JSDOM(html,{url:'https://grupo.example/dashboard.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document;w.scrollTo=()=>{};w.CompraSmart={getSupabaseClient:()=>client,showToast(){}};
 w.eval(analyticsCode);w.eval(searchCode);w.eval(dashboardCode);
 await until(()=>d.getElementById('comparisonResults').textContent.includes('Arroz de prueba'));
 const input=d.getElementById('comparisonSearch');input.value='Arroz';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.match(d.getElementById('comparisonResults').textContent,/Arroz de prueba/);assert.doesNotMatch(d.getElementById('comparisonResults').textContent,/Aceite de prueba/);
 d.getElementById('productSearchForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>!d.getElementById('webSupplierResults').hidden);
 assert.equal(w.location.pathname,'/dashboard.html');assert.equal(d.querySelectorAll('.web-search-result').length,1);
 assert.equal(d.querySelector('.web-search-result img'),null);assert.match(d.getElementById('webSupplierResults').textContent,/<img/);
 assert.equal(d.querySelector('.web-search-result a').href,'https://fuente.example.invalid/arroz');
 assert.deepEqual(JSON.parse(JSON.stringify(calls.find(x=>x.name==='search-products').body)),{query:'Arroz'});
 assert.equal(d.activeElement.id,'webSupplierResults');assert.equal(d.getElementById('webSupplierSearch'),null);
 input.value='';input.dispatchEvent(new w.Event('input'));assert.equal(d.getElementById('webSupplierResults').hidden,true);
 dom.window.close();
});

test('la fecha del comprobante conserva el día de emisión al mostrarse en Lima',async()=>{
 const [html,analyticsCode,dashboardCode]=await Promise.all([source('dashboard.html'),source('js/purchase-analytics.js'),source('js/dashboard.js')]);
 const {client}=clientFor({businesses:[fixtureBusiness],invoices:[{id:'date-qa',user_id:USER,business_id:BUSINESS,invoice_number:'QA-FECHA',issue_date:'2026-11-03',currency:'PEN',total_amount:20,ocr_status:'completed',created_at:new Date().toISOString()}]},new Map(),{});
 const dom=new JSDOM(html,{url:'https://grupo.example/dashboard.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const w=dom.window,d=w.document,DateTimeFormat=w.Intl.DateTimeFormat;
 w.Intl.DateTimeFormat=function(locale,options){return new DateTimeFormat(locale,{timeZone:'America/Lima',...options});};
 w.scrollTo=()=>{};w.CompraSmart={getSupabaseClient:()=>client,showToast(){}};w.eval(analyticsCode);w.eval(dashboardCode);
 await until(()=>d.getElementById('historyTableBody').textContent.includes('QA-FECHA'));
 assert.match(d.querySelector('#historyTableBody tr td:nth-child(3)').textContent,/^03 /);
 assert.match(d.querySelector('#invoicesTableBody tr td:nth-child(2)').textContent,/^03 /);
 w.Intl.DateTimeFormat=DateTimeFormat;w.close();
});
