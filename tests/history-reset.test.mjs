import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');
const code=await readFile(new URL('../js/history-reset.js',import.meta.url),'utf8');
const ownFile='qa-user/qa-business/comprobante-ficticio.png';
const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(setImmediate);}throw Error('No terminó la operación.');};

function page(options={}){
 const dom=new JSDOM(html,{url:'https://grupo.example/dashboard.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const d=dom.window.document,dialog=d.getElementById('resetHistoryDialog');
 // JSDOM no implementa la presentación nativa del elemento dialog.
 dialog.showModal=()=>dialog.setAttribute('open','');
 dialog.close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new dom.window.Event('close'));};
 let count=options.count??2,refreshes=0,queue=options.queue||[],uploading=false;
 const calls=[],storageCalls=[],queryCalls=[];
 const client={
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(options.rpc)return options.rpc(name,args);
   if(options.rpcError)return{error:{message:options.rpcError}};
   queue=options.afterResetQueue||[{id:'file-1',file_path:ownFile}];
   return{data:{success:true,deleted_invoices:count}};
  },
  storage:{from(bucket){return{remove:async paths=>{
   storageCalls.push({bucket,paths:[...paths]});
   return{error:options.storageError?{message:options.storageError}:null};
  }};}},
  from(table){
   assert.equal(table,'invoice_file_deletions');
   const conditions=[];let deleting=false,ids,limit=Infinity;
   const q={
    select(){return q;},order(){return q;},limit(n){limit=n;return q;},
    eq(field,value){conditions.push({field,value});return q;},
    delete(){deleting=true;return q;},in(field,values){assert.equal(field,'id');ids=values;return q;},
    then(resolve,reject){
     queryCalls.push({deleting,conditions:[...conditions]});
     assert.deepEqual(conditions,[{field:'user_id',value:'qa-user'},{field:'business_id',value:'qa-business'}]);
     if(deleting)queue=queue.filter(row=>!ids.includes(row.id));
     return Promise.resolve({data:deleting?null:queue.slice(0,limit),error:null}).then(resolve,reject);
    }
   };return q;
  }
 };
 dom.window.eval(code);
 const controller=dom.window.CompraSmartHistoryReset.mount({client,button:d.getElementById('resetHistoryButton'),dialog,
  cleanupButton:d.getElementById('cleanupHistoryFilesButton'),notice:d.getElementById('historyResetNotice'),
  userId:'qa-user',businessId:'qa-business',businessName:'Negocio <img src=x onerror=alert(1)>',
  getInvoiceIds:()=>Array.from({length:count},(_,i)=>`invoice-${i}`),isUploading:()=>uploading,onReset:async()=>{
   refreshes++;count=0;if(options.refreshError)throw Error('Fallo de refresco ficticio');
  }});
 const open=()=>d.getElementById('resetHistoryButton').click();
 const type=value=>{d.getElementById('resetHistoryConfirmation').value=value;d.getElementById('resetHistoryConfirmation').dispatchEvent(new dom.window.Event('input'));};
 const submit=()=>d.getElementById('resetHistoryForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 return {dom,d,dialog,controller,calls,storageCalls,queryCalls,options,open,type,submit,getQueue:()=>queue,
  refreshes:()=>refreshes,setUploading:value=>{uploading=value;}};
}

test('abrir, cancelar o escribir otra palabra no borra datos ni interpreta HTML del negocio',()=>{
 const p=page();p.open();
 assert.equal(p.dialog.open,true);assert.equal(p.d.activeElement.id,'cancelResetHistoryButton');
 assert.equal(p.d.getElementById('resetHistorySummary').querySelector('img'),null);
 assert.match(p.d.getElementById('resetHistorySummary').textContent,/Negocio <img/);
 p.type('eliminar');p.submit();assert.equal(p.calls.length,0);
 assert.equal(p.d.getElementById('confirmResetHistoryButton').disabled,true);
 p.d.getElementById('cancelResetHistoryButton').click();assert.equal(p.dialog.open,false);
 assert.equal(p.calls.length,0);p.dom.window.close();
});

test('la confirmación envía solo el negocio actual y evita dobles solicitudes',async()=>{
 let finish;
 const p=page({rpc:()=>new Promise(resolve=>{finish=resolve;})});p.open();p.type('ELIMINAR');p.submit();p.submit();
 assert.equal(p.calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(p.calls[0])),{name:'reset_purchase_history',args:{p_business_id:'qa-business',p_confirmation:'ELIMINAR',p_invoice_ids:['invoice-0','invoice-1']}});
 const escape=new p.dom.window.Event('cancel',{cancelable:true});p.dialog.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);
 finish({data:{success:true,deleted_invoices:2}});await until(()=>!p.controller.isBusy());
 assert.equal(p.refreshes(),1);assert.equal(p.dialog.open,false);
 assert.equal(p.d.getElementById('resetHistoryButton').disabled,true);
 assert.match(p.d.getElementById('historyResetNotice').textContent,/Historial reiniciado/);p.dom.window.close();
});

test('un rechazo del servidor mantiene el diálogo y no borra archivos',async()=>{
 const p=page({rpcError:'El historial cambió. Recarga antes de confirmar.'});p.open();p.type('ELIMINAR');p.submit();
 await until(()=>!p.controller.isBusy());
 assert.equal(p.dialog.open,true);assert.equal(p.refreshes(),0);assert.equal(p.storageCalls.length,0);
 assert.match(p.d.getElementById('resetHistoryMessage').textContent,/historial cambió/);p.dom.window.close();
});

test('la limpieza fallida persiste y puede reintentarse sin repetir el borrado de compras',async()=>{
 const p=page({storageError:'Red no disponible'});p.open();p.type('ELIMINAR');p.submit();await until(()=>!p.controller.isBusy());
 assert.equal(p.refreshes(),1);assert.equal(p.getQueue().length,1);
 assert.equal(p.d.getElementById('cleanupHistoryFilesButton').hidden,false);
 assert.match(p.d.getElementById('historyResetNotice').textContent,/historial se reinició.*pendientes/);
 p.options.storageError=null;p.d.getElementById('cleanupHistoryFilesButton').click();await until(()=>!p.controller.isBusy());
 assert.equal(p.calls.length,1);assert.equal(p.getQueue().length,0);
 assert.equal(p.d.getElementById('cleanupHistoryFilesButton').hidden,true);
 assert.equal(p.storageCalls.every(call=>call.bucket==='invoices'&&call.paths.every(path=>path===ownFile)),true);p.dom.window.close();
});

test('un error al refrescar no presenta el borrado confirmado como fallido',async()=>{
 const p=page({refreshError:true});p.open();p.type('ELIMINAR');p.submit();await until(()=>!p.controller.isBusy());
 assert.match(p.d.getElementById('historyResetNotice').textContent,/se reinició.*Recarga/);
 assert.equal(p.getQueue().length,0);assert.equal(p.calls.length,1);p.dom.window.close();
});

test('rechaza rutas ajenas incluso si llegaran en la respuesta de la cola',async()=>{
 const p=page({afterResetQueue:[{id:'other-file',file_path:'otro-usuario/otro-negocio/privado.png'}]});
 p.open();p.type('ELIMINAR');p.submit();await until(()=>!p.controller.isBusy());
 assert.equal(p.storageCalls.length,0);assert.equal(p.getQueue().length,1);
 assert.equal(p.d.getElementById('cleanupHistoryFilesButton').hidden,false);p.dom.window.close();
});

test('un historial vacío y una subida en curso no permiten reiniciar',()=>{
 const empty=page({count:0});empty.open();empty.type('ELIMINAR');
 assert.equal(empty.dialog.open,false);assert.equal(empty.calls.length,0);empty.dom.window.close();
 const p=page();p.setUploading(true);p.open();assert.equal(p.dialog.open,false);assert.equal(p.calls.length,0);
 p.setUploading(false);p.open();p.type('ELIMINAR');p.setUploading(true);p.submit();assert.equal(p.calls.length,0);p.dom.window.close();
});

test('tras recargar se puede completar la cola por lotes sin reiniciar datos nuevos',async()=>{
 const queue=Array.from({length:102},(_,i)=>({id:`pending-${i}`,file_path:`qa-user/qa-business/qa-${i}.png`}));
 const p=page({count:0,queue});await p.controller.checkPendingFiles();
 assert.equal(p.d.getElementById('cleanupHistoryFilesButton').hidden,false);
 p.d.getElementById('cleanupHistoryFilesButton').click();await until(()=>!p.controller.isBusy());
 assert.equal(p.storageCalls.length,2);assert.equal(p.getQueue().length,0);assert.equal(p.calls.length,0);p.dom.window.close();
});
