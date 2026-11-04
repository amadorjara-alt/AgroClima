// Ejecutar manualmente. Esta prueba llama a un servicio externo.
import {readFile} from 'node:fs/promises';
import {readWithOCRSpace} from '../supabase/functions/_shared/ocr-space.mjs';
const demo=process.argv.includes('--public-demo');
const key=demo?'helloworld':process.env.OCR_SPACE_API_KEY;
if(!key)throw Error('Configura OCR_SPACE_API_KEY en el entorno o usa --public-demo para la clave pública de prueba documentada por OCR.space.');
try{
 const bytes=await readFile(new URL('../tests/fixtures/receipt-demo.png',import.meta.url));
 const result=await readWithOCRSpace(new Blob([bytes],{type:'image/png'}),key);
 const ok=result.extracted.total===118&&result.extracted.items.length===2&&result.review_required;
 console.log(JSON.stringify({service:'OCR.space',real_api_call:true,key_type:demo?'public_documentation_demo':'environment',success:ok,total:result.extracted.total,item_count:result.extracted.items.length,review_required:result.review_required,partial:result.partial}));
 if(!ok)process.exitCode=1;
}catch(error){console.error(JSON.stringify({success:false,code:error.code||'ERROR',status:error.status||null}));process.exitCode=1;}
