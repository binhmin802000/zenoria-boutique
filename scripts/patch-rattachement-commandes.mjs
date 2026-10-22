// Correctif cible : rattachement des nouveaux achats au compte authentifie.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const MARK = "ZENORIA_ORDER_OWNER_V1";
const dry = process.argv.includes("--dry-run");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
function replaceOnce(text, old, next, label) {
  const count = text.split(old).length - 1;
  if (count !== 1) throw new Error(`${label} : ${count} reperes trouves, 1 attendu. Aucun fichier modifie.`);
  return text.replace(old, () => next);
}
const authBlock = `    // ${MARK}: identite verifiee par Supabase, jamais fournie par le JSON client.
    let checkoutUser = null;
    const authorization = req.headers.authorization;
    if (authorization !== undefined) {
      const match = typeof authorization === "string" && /^Bearer ([^\\s]+)$/i.exec(authorization);
      if (!match) return res.status(401).json({ ok: false, error: "Connexion invalide. Reconnectez-vous." });
      let authResult;
      try {
        authResult = await supabaseAdmin.auth.getUser(match[1]);
      } catch {
        return res.status(503).json({ ok: false, error: "Verification de connexion indisponible. Reessayez." });
      }
      if (authResult.error) {
        const status = Number(authResult.error.status);
        const unavailable = !status || status >= 500 || status === 429;
        return res.status(unavailable ? 503 : 401).json({ ok: false, error: unavailable
          ? "Verification de connexion indisponible. Reessayez."
          : "Session expiree ou invalide. Reconnectez-vous." });
      }
      checkoutUser = authResult.data && authResult.data.user;
      if (!checkoutUser || !checkoutUser.id) return res.status(401).json({ ok: false, error: "Reconnectez-vous avant de payer." });
    }
`;
function patchCheckout(t) {
 t=replaceOnce(t,'    const { items, promoCode } = req.body || {};',authBlock+'    const { items, promoCode } = req.body || {};','checkout/auth');
 t=replaceOnce(t,'          user_id: null,','          user_id: checkoutUser ? checkoutUser.id : null,','checkout/proprietaire');
 t=replaceOnce(t,'      metadata: {','      metadata: {\n        zenoria_user_id: checkoutUser ? checkoutUser.id : "",','checkout/metadata');
 return t;
}
function patchWebhook(t) {
 t=replaceOnce(t,'    const meta = session.metadata || {};',`    const meta = session.metadata || {};
    // ${MARK}: metadata ajoutee uniquement par notre checkout serveur.
    const metadataUserId = typeof meta.zenoria_user_id === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meta.zenoria_user_id)
      ? meta.zenoria_user_id : null;`,'webhook/metadata');
 t=replaceOnce(t,'          user_id: null,','          user_id: metadataUserId,','webhook/filet de securite');
 return t;
}
function patchIndex(t) {
 if (!/import[\s\S]*?\bsupabase\b[\s\S]*?from ["\x27]@\/lib\/supabase["\x27]/.test(t)) throw new Error('Import supabase non reconnu dans pages/index.js. Aucun fichier modifie.');
 t=replaceOnce(t,'      const res = await fetch("/api/checkout", {',`      // ${MARK}: ne jamais envoyer le jeton dans le JSON ou dans Stripe.
      const { data: checkoutAuth, error: checkoutAuthError } = await supabase.auth.getSession();
      if (checkoutAuthError) throw new Error("Session indisponible");
      const checkoutToken = checkoutAuth && checkoutAuth.session ? checkoutAuth.session.access_token : null;
      const res = await fetch("/api/checkout", {`,'index/appel checkout');
 const start=t.indexOf('      const res = await fetch("/api/checkout", {');
 const end=t.indexOf('      const data = await res.json();',start);
 if(end<0) throw new Error('Fin du checkout introuvable. Aucun fichier modifie.');
 const segment=t.slice(start,end);
 const next=replaceOnce(segment,'        headers: { "Content-Type": "application/json" },',`        headers: {
          "Content-Type": "application/json",
          ...(checkoutToken ? { Authorization: \`Bearer \${checkoutToken}\` } : {}),
        },`,'index/headers');
 return t.slice(0,start)+next+t.slice(end);
}
try {
 if(git('rev-parse','--abbrev-ref','HEAD')!=='correctif-rattachement-commandes') throw new Error('Branche attendue : correctif-rattachement-commandes');
 const specs=[['pages/index.js',patchIndex],['pages/api/checkout.js',patchCheckout],['pages/api/webhooks/stripe.js',patchWebhook]];
 const plans=specs.map(([file,patch])=>{
   const raw=fs.readFileSync(file,'utf8');
   const bom=raw.startsWith('\uFEFF');
   const text=(bom?raw.slice(1):raw).replace(/\r\n/g,'\n');
   if(text.includes(MARK)) return {file,skip:true};
   if(git('status','--porcelain','--',file)) throw new Error(`${file} contient des modifications non commitees. Ne les effacez pas : sauvegardez-les avant de continuer.`);
   const result=patch(text);
   return {file,data:(bom?'\uFEFF':'')+(raw.includes('\r\n')?result.replace(/\n/g,'\r\n'):result)};
 });
 const todo=plans.filter(x=>!x.skip);
 console.log(`Verification reussie : ${todo.length} fichier(s) a modifier.`);
 for(const plan of plans) console.log(`${plan.skip?'Deja applique':'Valide'} : ${plan.file}`);
 if(dry) console.log('Verification seule : aucun fichier modifie.');
 else {
   for(const plan of todo) fs.writeFileSync(plan.file,plan.data,'utf8');
   console.log('Application terminee. Lancez npm run build puis git diff --check.');
 }
} catch(e) { console.error('ARRET : '+e.message); process.exitCode=1; }
