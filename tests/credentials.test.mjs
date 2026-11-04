import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptSecret,decryptSecret,validateCredentialChange,encodeBase64} from '../supabase/functions/_shared/credentials.mjs';
const master=encodeBase64(new Uint8Array(32).fill(17));
test('el cifrado AES-GCM no contiene la clave y puede recuperarse en el servidor',async()=>{
 const row=await encryptSecret('clave-ficticia-de-prueba',master);
 assert.equal(JSON.stringify(row).includes('clave-ficticia'),false);
 assert.equal(await decryptSecret(row,master),'clave-ficticia-de-prueba');
});
test('descifra exactamente el formato legado sin modificar el ciphertext o el IV',async()=>{
 const raw=new Uint8Array(32).fill(17),iv=new Uint8Array(12).fill(23);
 const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']);
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('formato-anterior'));
 const row={encrypted_key:encodeBase64(new Uint8Array(bytes)),iv:encodeBase64(iv)},before=JSON.stringify(row);
 assert.equal(await decryptSecret(row,master),'formato-anterior');assert.equal(JSON.stringify(row),before);
});
test('una clave vacía conserva la credencial existente; no crea una integración vacía',()=>{
 assert.deepEqual(validateCredentialChange('   ',true),{preserve:true,value:''});
 assert.throws(()=>validateCredentialChange('',false),/Introduce/);
});
test('clave maestra incorrecta o ciphertext alterado no se acepta',async()=>{
 const row=await encryptSecret('prueba-sin-secretos',master);
 await assert.rejects(decryptSecret(row,encodeBase64(new Uint8Array(32).fill(99))));
 await assert.rejects(decryptSecret({...row,iv:'AA=='},master),/IV/);
 await assert.rejects(encryptSecret('prueba','AA=='),/32 bytes/);
});
