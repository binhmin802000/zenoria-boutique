// Initialisation du client Supabase (authentification uniquement pour le moment).
// Les clés sont lues depuis les variables d'environnement NEXT_PUBLIC_...
// définies dans le fichier .env.local (jamais commité sur GitHub).
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
