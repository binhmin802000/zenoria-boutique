import React, { useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
const initial={state:"idle",data:null,error:"",checkedAt:null};
function formatBytes(value){
  const n=Number(value)||0;
  if(n<1024)return n+" o";
  if(n<1024**2)return(n/1024).toFixed(1).replace(".",",")+" Kio";
  if(n<1024**3)return(n/1024**2).toFixed(1).replace(".",",")+" Mio";
  return(n/1024**3).toFixed(2).replace(".",",")+" Gio";
}
async function adminPost(){
  const {data,error}=await supabase.auth.getSession();
  if(error||!data?.session?.access_token) throw new Error("Session administrateur introuvable. Reconnectez-vous.");
  const response=await fetch("/api/admin/r2/analytics-check",{method:"POST",headers:{Authorization:"Bearer "+data.session.access_token}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.ok) throw new Error(payload.error||"Diagnostic Analytics Cloudflare impossible.");
  return payload;
}
export default function AdminR2AnalyticsCheck({busy=false}){
  const [check,setCheck]=useState(initial);
  async function run(){setCheck({...initial,state:"running"});try{const data=await adminPost();setCheck({state:"ok",data,error:"",checkedAt:Date.now()})}catch(error){setCheck({state:"fail",data:null,error:error?.message||String(error),checkedAt:Date.now()})}}
  const labels={idle:"Non teste",running:"En cours",ok:"Reussi",fail:"Echec"};
  return <article className="mt-4 rounded-xl border border-[#eee2e5] p-4" data-testid="r2-analytics">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-2"><BarChart3 size={18} className="mt-0.5 text-[#8f6075]"/><div><h3 className="text-sm font-medium">Analytics Cloudflare</h3><p className="mt-1 text-[11px] text-[#8b737e]">Metriques brutes du bucket configure. Le classement tarifaire A/B sera ajoute apres verification des actions observees.</p></div></div><span className="rounded-full bg-[#f5edf1] px-3 py-1 text-xs">{labels[check.state]}</span></div>
    {check.data&&<div className="mt-3 text-xs leading-5 text-[#54434c]">
      <p>Jeu stockage : <strong>{check.data.storageDataset?"Disponible":"Indisponible"}</strong> · Operations : <strong>{check.data.operationsDataset?"Disponibles":"Indisponibles"}</strong></p>
      {check.data.storage?<div className="mt-2"><p>Donnees objets : <strong>{formatBytes(check.data.storage.payloadBytes)}</strong> · Metadonnees : <strong>{formatBytes(check.data.storage.metadataBytes)}</strong></p><p>Objets : <strong>{check.data.storage.objectCount}</strong> · Uploads multipart en attente : <strong>{check.data.storage.pendingUploads}</strong></p></div>:<p className="mt-2 rounded-lg bg-amber-50 p-3 text-amber-900">Aucun echantillon de stockage retourne.</p>}
      <p className="mt-2">Operations depuis le debut du mois :</p>
      {check.data.operations?.length?<ul className="mt-1 max-h-44 overflow-auto rounded-lg bg-[#faf6f8] p-3">{check.data.operations.map((item)=><li key={item.actionType+"-"+item.actionStatus} className="flex justify-between gap-3"><span className="break-all">{item.actionType} · {item.actionStatus}</span><strong>{item.requests}</strong></li>)}</ul>:<p>Aucune operation retournee.</p>}
      <p className="mt-2 text-[11px] text-[#8b737e]">Donnees Analytics indicatives, non contractuelles pour la facturation. Duree : {check.data.durationMs||0} ms.</p>
    </div>}
    {check.error&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{check.error}</p>}
    <button type="button" disabled={busy||check.state==="running"} onClick={run} data-testid="r2-analytics-run" className="mt-4 flex h-9 items-center gap-2 rounded-full border border-[#d9c5cc] px-4 text-xs hover:bg-[#f5edf1] disabled:opacity-50"><RefreshCw size={14} className={check.state==="running"?"animate-spin":""}/>Actualiser les metriques R2</button>
  </article>;
}
