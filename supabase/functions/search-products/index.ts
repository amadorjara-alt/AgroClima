import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createProductSearchHandler } from "../_shared/search-products.mjs";

Deno.serve(createProductSearchHandler({createClient, env: (name: string) => Deno.env.get(name)}));
