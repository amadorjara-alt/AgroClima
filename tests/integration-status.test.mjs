import test from 'node:test';
import assert from 'node:assert/strict';
import {ocrConfiguration} from '../supabase/functions/_shared/integration-status.mjs';
test('el estado distingue una clave personal, una del proyecto y ninguna configuración',()=>{
 assert.deepEqual(ocrConfiguration([],false),{configured:false,source:null});
 assert.deepEqual(ocrConfiguration([],true),{configured:true,source:'project'});
 assert.deepEqual(ocrConfiguration([{provider:'gemini'}],false),{configured:false,source:null});
 assert.deepEqual(ocrConfiguration([{provider:'ocrspace'}],true),{configured:true,source:'account'});
});
test('el estado no devuelve valores privados ni declara el proveedor verificado',()=>{
 const result=ocrConfiguration([{provider:'ocrspace',encrypted_key:'ciphertext-ficticio',iv:'iv-ficticio'}],true);
 assert.deepEqual(Object.keys(result).sort(),['configured','source']);
 assert.ok(!JSON.stringify(result).includes('ficticio'));assert.equal(result.verified,undefined);
});
