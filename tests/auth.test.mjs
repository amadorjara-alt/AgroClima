import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
async function until(condition){for(let i=0;i<100;i++){if(condition())return;await new Promise(setImmediate);}throw Error('No terminó la operación de autenticación simulada.');}
async function page(name,{google=true,known=true,oauthError=null,loginError=null,noClient=false,suffix=''}={}){
 const [html,code]=await Promise.all([source(name),source('js/auth.js')]);
 const dom=new JSDOM(html,{url:'https://grupo.example/CompraSmart-AI/'+name+suffix,runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const calls=[];
 const auth={
  getSession:async()=>({data:{session:null},error:null}),onAuthStateChange(){},
  signInWithPassword:async body=>{calls.push({type:'password',body});return loginError?{error:loginError}:{data:{user:{id:'qa-user'},session:{access_token:'sesion-ficticia'}}};},
  signUp:async body=>{calls.push({type:'signup',body});return{data:{user:{id:'qa-user'},session:null},error:null};},
  signInWithOAuth:async body=>{calls.push({type:'oauth',body});return oauthError?{error:oauthError}:{data:{provider:'google',url:'https://accounts.google.com/o/oauth2/v2/auth'}};},
 };
 dom.window.CompraSmart={getSupabaseClient:()=>noClient?null:{auth}};
 dom.window.CompraSmartSupabase={getAuthCapabilities:async()=>({known,google})};
 dom.window.eval(code);
 await new Promise(setImmediate);
 return{dom,calls,document:dom.window.document};
}
function submit(page,id){page.document.getElementById(id).dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));}
test('correo y contraseña se envían a Supabase Auth; los errores no crean una sesión ficticia',async()=>{
 const p=await page('login.html',{loginError:{message:'Invalid login credentials'}});
 p.document.getElementById('email').value='qa@example.invalid';p.document.getElementById('password').value='clave-ficticia-123';
 submit(p,'loginForm');await until(()=>p.document.getElementById('loginMessage').classList.contains('error'));
 assert.equal(p.calls[0].type,'password');assert.equal(p.calls[0].body.email,'qa@example.invalid');
 assert.match(p.document.getElementById('loginMessage').textContent,/incorrectos/);assert.equal(p.dom.window.localStorage.length,0);
 p.dom.window.close();
});
test('un login válido requiere usuario y sesión devueltos por Supabase',async()=>{
 const p=await page('login.html');p.document.getElementById('email').value='qa@example.invalid';p.document.getElementById('password').value='clave-ficticia-123';
 submit(p,'loginForm');await until(()=>p.document.getElementById('loginMessage').classList.contains('success'));
 assert.equal(p.calls.filter(x=>x.type==='password').length,1);assert.match(p.document.getElementById('loginMessage').textContent,/Inicio de sesión correcto/);
 p.dom.window.close();
});
test('el registro conserva el negocio y devuelve la confirmación al subdirectorio de la web',async()=>{
 const p=await page('register.html');
 for(const[id,value]of Object.entries({businessName:'Negocio ficticio',ownerName:'Persona de prueba',registerEmail:'qa@example.invalid',registerPassword:'clave-ficticia-123',confirmPassword:'clave-ficticia-123'}))p.document.getElementById(id).value=value;
 submit(p,'registerForm');assert.equal(p.calls.length,0);
 p.document.getElementById('acceptTerms').checked=true;submit(p,'registerForm');
 await until(()=>p.document.getElementById('registerMessage').classList.contains('success'));
 const request=p.calls.find(x=>x.type==='signup').body;
 assert.equal(request.options.emailRedirectTo,'https://grupo.example/CompraSmart-AI/login.html');
 assert.equal(request.options.data.business_name,'Negocio ficticio');assert.match(p.document.getElementById('registerMessage').textContent,/confirma/);
 assert.equal(p.document.getElementById('registerPassword').value,'');p.dom.window.close();
});
test('Google llama al flujo OAuth real con retorno a login; no solicita permisos de Sheets o Drive',async()=>{
 const p=await page('login.html');p.document.getElementById('googleLoginButton').click();
 await until(()=>p.calls.some(x=>x.type==='oauth'));
 const request=p.calls.find(x=>x.type==='oauth').body;
 assert.equal(request.provider,'google');assert.equal(request.options.redirectTo,'https://grupo.example/CompraSmart-AI/login.html');assert.equal(request.options.scopes,undefined);
 assert.equal(p.document.getElementById('loginMessage').classList.contains('success'),false);p.dom.window.close();
});
test('un proveedor Google deshabilitado no aparece como listo ni inicia OAuth',async()=>{
 const p=await page('login.html',{google:false});
 await until(()=>p.document.getElementById('googleLoginButton').disabled);
 p.document.getElementById('googleLoginButton').click();assert.equal(p.calls.length,0);
 assert.match(p.document.getElementById('googleLoginAvailability').textContent,/aún no está habilitado/);p.dom.window.close();
});
test('una configuración OAuth rechazada muestra el error y permite seguir con correo',async()=>{
 const p=await page('login.html',{known:false,oauthError:{message:'Unsupported provider: provider is not enabled'}});
 p.document.getElementById('googleLoginButton').click();await until(()=>p.document.getElementById('loginMessage').classList.contains('error'));
 assert.match(p.document.getElementById('loginMessage').textContent,/aún no está habilitado/);assert.equal(p.document.getElementById('loginButton').disabled,false);p.dom.window.close();
});
test('una cancelación externa no refleja detalles de la URL en la página',async()=>{
 const p=await page('login.html',{suffix:'?error=access_denied&error_description=DETALLE_QUE_NO_DEBE_REFLEJARSE'});
 assert.match(p.document.getElementById('loginMessage').textContent,/canceló/);assert.doesNotMatch(p.document.getElementById('loginMessage').textContent,/DETALLE_QUE/);p.dom.window.close();
});
test('sin SDK o cliente autenticación los controles no envían credenciales mediante el formulario nativo',async()=>{
 const p=await page('login.html',{noClient:true});assert.equal(p.document.getElementById('loginButton').disabled,true);assert.equal(p.document.getElementById('googleLoginButton').disabled,true);
 const event=new p.dom.window.Event('submit',{bubbles:true,cancelable:true});p.document.getElementById('loginForm').dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 assert.match(p.document.getElementById('loginMessage').textContent,/No se pudo inicializar/);assert.equal(p.calls.length,0);p.dom.window.close();
});
test('la disponibilidad de Google se consulta sin tokens de usuario y se puede actualizar',async()=>{
 const [html,code]=await Promise.all([source('login.html'),source('js/supabase.js')]);
 const dom=new JSDOM(html,{url:'https://grupo.example/CompraSmart-AI/login.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 let count=0,enabled=false;
 dom.window.AbortSignal=AbortSignal;
 dom.window.supabase={createClient:()=>({auth:{onAuthStateChange(){}},from(){}})};
 dom.window.fetch=async(url,options)=>{count++;assert.equal(url,'https://fledooqwmwrjufeihoqn.supabase.co/auth/v1/settings');assert.equal(options.headers.Authorization,undefined);assert.match(options.headers.apikey,/^sb_publishable_/);return Response.json({external:{google:enabled}});};
 dom.window.eval(code);
 const api=dom.window.CompraSmartSupabase;
 assert.equal((await api.getAuthCapabilities()).google,false);await api.getAuthCapabilities();assert.equal(count,1);
 enabled=true;assert.equal((await api.getAuthCapabilities({refresh:true})).google,true);assert.equal(count,2);dom.window.close();
});
