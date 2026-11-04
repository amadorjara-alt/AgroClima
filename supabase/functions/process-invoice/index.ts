import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createInvoiceHandler } from "../_shared/process-invoice.mjs";

Deno.serve(createInvoiceHandler({createClient,env:(name: string)=>Deno.env.get(name)}));

