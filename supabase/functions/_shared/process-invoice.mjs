import { readWithOCRSpace, OCRProviderError } from './ocr-space.mjs';
import { decryptSecret } from './credentials.mjs';

export function createInvoiceHandler({createClient, env, fetchImpl = fetch}) {
    const headers = {
        'Access-Control-Allow-Origin': env('APP_ORIGIN') || '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin',
        'Content-Type': 'application/json; charset=utf-8'
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers});
    return async request => {
        if (request.method === 'OPTIONS') return new Response('ok', {headers});
        if (request.method !== 'POST') return reply({success:false,error:'Método no permitido.'},405);
        let admin, invoice, requestId, userId;
        try {
            const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i,'');
            if (!token) return reply({success:false,error:'Inicia sesión para procesar una factura.'},401);
            const url=env('SUPABASE_URL'), anon=env('SUPABASE_ANON_KEY'), service=env('SUPABASE_SERVICE_ROLE_KEY');
            if (!url || !anon || !service) throw new Error('SERVER_CONFIG');
            const options={auth:{persistSession:false,autoRefreshToken:false}};
            const caller=createClient(url,anon,{...options,global:{headers:{Authorization:'Bearer '+token}}});
            const {data:auth,error:authError}=await caller.auth.getUser(token);
            if (authError || !auth?.user) return reply({success:false,error:'La sesión no es válida o ha caducado.'},401);
            userId=auth.user.id;
            let body;
            try { body=await request.json(); } catch { return reply({success:false,error:'Envía una solicitud JSON válida.'},400); }
            const path=body?.file_path;
            if (typeof path !== 'string' || path.length>1000 || !path.startsWith(userId+'/') || path.split('/').some(p=>!p||p==='.'||p==='..')) {
                return reply({success:false,error:'Ruta de comprobante no válida.'},400);
            }
            const {data:row,error:lookupError}=await caller.from('invoices')
                .select('id,user_id,business_id,file_path,ocr_status,ocr_draft,confirmed_at')
                .eq('file_path',path).eq('user_id',userId).maybeSingle();
            if (lookupError || !row) return reply({success:false,error:'No se encontró esta factura en tu cuenta.'},404);
            invoice=row;
            const {data:business,error:businessError}=await caller.from('businesses').select('id')
                .eq('id',row.business_id).eq('user_id',userId).maybeSingle();
            if (businessError || !business) return reply({success:false,error:'El negocio del comprobante no pertenece a tu cuenta.'},403);
            if (!path.startsWith(userId+'/'+row.business_id+'/')) return reply({success:false,error:'El archivo no corresponde al negocio del comprobante.'},400);
            if (row.confirmed_at) return reply({success:true,invoice_id:row.id,confirmed:true,cached:true,review_required:false});
            if (row.ocr_status==='review' && row.ocr_draft) {
                return reply({success:true,invoice_id:row.id,cached:true,review_required:true,provider:'ocrspace',extracted:row.ocr_draft});
            }
            admin=createClient(url,service,options);
            const {data:credential,error:credentialError}=await admin.from('integration_credentials')
                .select('encrypted_key,iv').eq('user_id',userId).eq('provider','ocrspace').maybeSingle();
            if (credentialError) throw new Error('VAULT_READ');
            let apiKey=env('OCR_SPACE_API_KEY') || '';
            if (credential) {
                try { apiKey=await decryptSecret(credential,env('CREDENTIALS_ENCRYPTION_KEY')); }
                catch { return reply({success:false,error:'No se pudo abrir tu credencial de OCR.space. Conserva el secreto de cifrado original y revisa la configuración del servidor.',code:'OCR_VAULT_ERROR'},503); }
            }
            if (!apiKey) return reply({success:false,error:'Guarda tu clave gratuita de OCR.space en Integraciones antes de procesar. El archivo ya está guardado y puedes reintentarlo.',code:'OCR_KEY_MISSING'},503);
            const {data:claim,error:claimError}=await admin.rpc('begin_invoice_ocr',{p_invoice_id:row.id,p_user_id:userId});
            if (claimError) {
                const busy=String(claimError.message).includes('OCR_BUSY'), quota=String(claimError.message).includes('OCR_QUOTA');
                return reply({success:false,error:busy?'Esta factura ya se está procesando. Espera un momento.':quota?'Se alcanzó el límite de escaneos del proyecto gratuito. Vuelve a intentarlo mañana.':'No se pudo iniciar el análisis del comprobante.',code:busy?'OCR_BUSY':quota?'OCR_QUOTA':'OCR_START_ERROR'},busy?409:quota?429:400);
            }
            if (claim.confirmed) return reply({success:true,invoice_id:row.id,confirmed:true,cached:true,review_required:false});
            if (claim.cached) return reply({success:true,invoice_id:row.id,cached:true,review_required:true,provider:'ocrspace',extracted:claim.draft});
            requestId=claim.request_id;
            const {data:file,error:downloadError}=await caller.storage.from('invoices').download(path);
            if (downloadError || !file) throw new OCRProviderError('No se pudo leer el archivo privado del comprobante.',{status:422,code:'OCR_FILE_DOWNLOAD'});
            const result=await readWithOCRSpace(file,apiKey,{fetchImpl});
            const {data:saved,error:saveError}=await admin.from('invoices')
                .update({ocr_status:'review',ocr_draft:result.extracted,ocr_error:null,ocr_provider:'ocrspace',processed_at:new Date().toISOString()})
                .eq('id',row.id).eq('user_id',userId).eq('ocr_request_id',requestId).select('id').maybeSingle();
            if (saveError || !saved) throw new Error('DRAFT_SAVE');
            await admin.from('ocr_requests').update({outcome:'review'}).eq('id',requestId).eq('user_id',userId);
            return reply({success:true,invoice_id:row.id,...result});
        } catch(error) {
            const known=error instanceof OCRProviderError, code=known?error.code:'OCR_INTERNAL_ERROR';
            const message=known?error.message:'No se pudo completar el procesamiento. El archivo permanece guardado; vuelve a intentarlo.';
            if (admin && invoice && requestId) {
                await admin.from('invoices').update({ocr_status:'failed',ocr_error:code})
                    .eq('id',invoice.id).eq('user_id',userId).eq('ocr_request_id',requestId);
                await admin.from('ocr_requests').update({outcome:'failed'}).eq('id',requestId).eq('user_id',userId);
            }
            console.error('process-invoice:',code); // Sin documentos, tokens ni claves.
            return reply({success:false,error:message,code},known?error.status:500);
        }
    };
}
