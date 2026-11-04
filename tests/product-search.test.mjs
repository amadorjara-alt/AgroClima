import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {createProductSearchHandler} from '../supabase/functions/_shared/search-products.mjs';

function harness({fetchImpl,valid=true,key='',now=Date.now}={}){
 const calls=[];
 const handler=createProductSearchHandler({now,env:name=>({SUPABASE_URL:'https://qa.example.invalid',SUPABASE_ANON_KEY:'publica-ficticia',TAVILY_API_KEY:key})[name],
  createClient:(_url,anon)=>{assert.equal(anon,'publica-ficticia');return {auth:{getUser:async()=>({data:{user:valid?{id:'usuario-de-prueba'}:null},error:valid?null:Error('inválida')})}};},
  fetchImpl:async(...args)=>{calls.push(args);return fetchImpl?fetchImpl(...args):Response.json({results:[{title:'Fuente de prueba',url:'https://fuente.example.invalid/producto',content:'S/ 9, valor ficticio para pruebas.',raw_content:'no se devuelve'}]});}});
 const request=(body={query:'Arroz'},authorized=true)=>handler(new Request('https://qa.example.invalid/functions/v1/search-products',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer token-ficticio'}:{})},body:typeof body==='string'?body:JSON.stringify(body)}));
 return {request,calls};
}
test('la búsqueda web rechaza anónimos y sesiones inválidas antes de llamar al proveedor',async()=>{
 for(const [h,authorized] of [[harness(),false],[harness({valid:false}),true]]){
  const response=await h.request({query:'Arroz'},authorized);assert.equal(response.status,401);assert.equal(h.calls.length,0);
 }
});
test('consulta una API real por contrato, usa la modalidad gratuita y limita la respuesta a fuentes seguras',async()=>{
 const h=harness(),res=await h.request(),body=await res.json();assert.equal(res.status,200);assert.equal(body.results.length,1);
 const [url,args]=h.calls[0],query=JSON.parse(args.body);assert.equal(url,'https://api.tavily.com/search');assert.equal(args.headers['X-Tavily-Access-Mode'],'keyless');
 assert.equal(query.search_depth,'basic');assert.equal(query.auto_parameters,false);assert.equal(query.include_answer,false);assert.equal(query.max_results,5);assert.match(query.query,/Arroz.*Perú/);
 assert.deepEqual(Object.keys(body.results[0]).sort(),['content','title','url']);
 const bad=harness({fetchImpl:async()=>Response.json({results:[{url:'javascript:alert(1)'},{url:'https://user:password@example.invalid'},{url:'https://ok.example.invalid',title:'ok'}]})});
 assert.equal((await (await bad.request()).json()).results.length,1);
});
test('las claves opcionales solo se envían a Tavily y los errores nunca reflejan el cuerpo del proveedor',async()=>{
 const secret='clave-ficticia-privada',h=harness({key:secret,fetchImpl:async()=>new Response(secret,{status:401})});
 const r=await h.request();assert.equal(r.status,502);assert.doesNotMatch(await r.text(),new RegExp(secret));
 assert.equal(h.calls[0][1].headers.Authorization,'Bearer '+secret);assert.equal(h.calls[0][1].headers['X-Tavily-Access-Mode'],undefined);
});
test('rechaza consultas vacías, cuerpos grandes y JSON inválido sin gastar búsquedas',async()=>{
 const h=harness();for(const body of [{query:''},{query:'x'},{query:'a'.repeat(121)},'{','x'.repeat(3000)])assert.equal((await h.request(body)).status,400);
 assert.equal(h.calls.length,0);
});
test('la caché evita llamadas duplicadas pero siempre exige autenticación',async()=>{
 const h=harness();await h.request();const r=await h.request({query:'arroz'});assert.equal((await r.json()).cached,true);assert.equal(h.calls.length,1);
 assert.equal((await h.request({query:'Arroz'},false)).status,401);assert.equal(h.calls.length,1);
});
test('cuotas y tiempos de espera muestran errores recuperables y nunca resultados ficticios',async()=>{
 const limit=harness({fetchImpl:async()=>new Response('detalle privado',{status:429})}),r=await limit.request();assert.equal(r.status,429);assert.equal((await r.json()).code,'SEARCH_RATE_LIMIT');
 const timeout=harness({fetchImpl:async()=>{const e=Error('detalle interno');e.name='TimeoutError';throw e;}}),t=await timeout.request();assert.equal(t.status,504);assert.equal((await t.json()).code,'SEARCH_TIMEOUT');
 const malformed=harness({fetchImpl:async()=>Response.json({error:'sin resultados'})});assert.equal((await malformed.request()).status,502);
});
test('no permite más de cinco consultas nuevas por minuto por usuario en la instancia',async()=>{
 const h=harness();for(let i=0;i<5;i++)assert.equal((await h.request({query:'producto '+i})).status,200);
 assert.equal((await h.request({query:'otro producto'})).status,429);assert.equal(h.calls.length,5);
});

async function page(invoke){
 const code=await readFile(new URL('../js/product-search.js',import.meta.url),'utf8');
 const dom=new JSDOM('<form id="f"><input id="q"><button id="b">Buscar</button></form><p id="s"></p><section id="r" tabindex="-1" hidden><p id="c"></p><div id="l"></div></section>',{url:'https://qa.example.invalid',runScripts:'outside-only'});
 const d=dom.window.document;dom.window.eval(code);const client={auth:{getSession:async()=>({data:{session:{access_token:'token-ficticio'}}})},functions:{invoke}};
 dom.window.CompraSmartProductSearch.mount({client,form:d.getElementById('f'),input:d.getElementById('q'),button:d.getElementById('b'),status:d.getElementById('s'),results:d.getElementById('r'),list:d.getElementById('l'),caption:d.getElementById('c')});
 const type=value=>{d.getElementById('q').value=value;d.getElementById('q').dispatchEvent(new dom.window.Event('input'));};
 const submit=()=>d.getElementById('f').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));return {dom,d,type,submit};
}
async function settle(){for(let i=0;i<10;i++)await new Promise(setImmediate);}
test('cambiar el producto descarta respuestas antiguas y evita mostrar resultados de otra consulta',async()=>{
 let resolve;const p=await page(()=>new Promise(r=>{resolve=r;}));p.type('arroz');p.submit();await settle();p.type('aceite');
 resolve({data:{success:true,results:[{title:'Arroz anterior',url:'https://qa.example.invalid/arroz'}]}});await settle();
 assert.equal(p.d.getElementById('r').hidden,true);assert.equal(p.d.querySelectorAll('.web-search-result').length,0);assert.equal(p.d.getElementById('b').disabled,false);p.dom.window.close();
});
test('un límite del servicio se informa en la página sin abrir ventanas ni inventar ofertas',async()=>{
 const p=await page(async()=>({error:{context:Response.json({code:'SEARCH_RATE_LIMIT'},{status:429})}}));p.type('arroz');p.submit();p.submit();await settle();
 assert.match(p.d.getElementById('s').textContent,/límite temporal/);assert.equal(p.d.getElementById('r').hidden,true);assert.equal(p.d.getElementById('b').disabled,false);p.dom.window.close();
});
