import React, { useEffect, useState } from "react";
import { Instagram, Heart, Sparkles, Mail, MessageCircle, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { SITE_SETTINGS_TABLE } from "@/lib/siteSettings";
import { CONTACT_KEY, DEFAULT_CONTACT, parseContactSetting, buildMailtoLink, buildWhatsAppLink, buildSignalLink } from "@/lib/contactSettings";
import { fetchReviewsSetting, DEFAULT_REVIEWS } from "@/lib/reviewsSettings";
import CrystalLogo from "@/components/CrystalLogo";

// ============================================================
// PIED DE PAGE PARTAGÉ — utilisé par l'accueil (/) et le quiz (/quiz).
// Autonome : charge lui-même reviewsCfg et contactSettings.
//
//  seasons : liste [{ key, name }], ou [] pour un lien générique vers
//            le catalogue.
//  seasonsOnClick : optionnel, fonction (key) => void, pour un clic
//            direct (utilisé sur l'accueil). Sinon, lien classique
//            href="/#saison=...".
//  logoMode, logoCompact, logoDark : props transmises à CrystalLogo.
// ============================================================
export default function Footer({ seasons = [], seasonsOnClick = null, logoMode = 1, logoCompact = false, logoDark = true }) {
  const [reviewsCfg, setReviewsCfg] = useState(DEFAULT_REVIEWS);
  const [contactSettings, setContactSettings] = useState(DEFAULT_CONTACT);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cfg, contactRes] = await Promise.all([
        fetchReviewsSetting(supabase),
        supabase.from(SITE_SETTINGS_TABLE).select("value").eq("key", CONTACT_KEY).maybeSingle(),
      ]);
      if (!alive) return;
      setReviewsCfg(cfg);
      setContactSettings(parseContactSetting(contactRes && !contactRes.error && contactRes.data ? contactRes.data.value : null));
    })();
    return () => { alive = false; };
  }, []);

  const hasContact =
    (contactSettings.email.enabled && contactSettings.email.value.trim()) ||
    (contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim()) ||
    (contactSettings.signal.enabled && contactSettings.signal.value.trim());

  return (
    <footer className="bg-[#2f252d] text-white/70 py-12">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-9">
        <div>
          <CrystalLogo mode={logoMode} compact={logoCompact} dark={logoDark} />
          <p className="text-xs mt-5 leading-6">L&apos;énergie du cristal, l&apos;harmonie de l&apos;âme.</p>
        </div>
        <div>
          <div className="text-white mb-3">Boutique</div>
          <div className="text-sm space-y-2">
            {seasons.length > 0 ? (
              seasons.map((s) => (
                <p key={s.key}>
                  {seasonsOnClick ? (
                    <button
                      type="button"
                      data-testid="footer-season"
                      onClick={() => seasonsOnClick(s.key)}
                      className="text-left hover:text-white underline-offset-2 hover:underline"
                    >
                      {s.name}
                    </button>
                  ) : (
                    <a href={`/#saison=${encodeURIComponent(s.key)}`} className="hover:text-white underline-offset-2 hover:underline">
                      {s.name}
                    </a>
                  )}
                </p>
              ))
            ) : (
              <p>
                <a href="/#collections" className="hover:text-white underline-offset-2 hover:underline">Collections</a>
              </p>
            )}
          </div>
        </div>
        <div>
          <div className="text-white mb-3">Informations</div>
          <div className="text-sm space-y-2">
            <p className="flex items-center gap-2 text-white/40">
              Livraison et retours
              <span className="text-[10px] uppercase tracking-wide rounded-full border border-white/20 px-2 py-0.5">Bientôt</span>
            </p>
            <p className="flex items-center gap-2 text-white/40">
              FAQ
              <span className="text-[10px] uppercase tracking-wide rounded-full border border-white/20 px-2 py-0.5">Bientôt</span>
            </p>
            <p><a href="/cgv" className="hover:text-white underline-offset-2 hover:underline">Conditions générales de vente</a></p>
            <p><a href="/mentions-legales" className="hover:text-white underline-offset-2 hover:underline">Mentions légales</a></p>
            <p><a href="/confidentialite" className="hover:text-white underline-offset-2 hover:underline">Politique de confidentialité</a></p>
            {reviewsCfg.enabled && <p><a href="/charte-des-avis" className="hover:text-white underline-offset-2 hover:underline">Charte des avis</a></p>}
          </div>
        </div>
        <div>
          <div className="text-white mb-3 flex items-center gap-2">
            Suivez-nous
            <span className="text-[10px] uppercase tracking-wide rounded-full border border-white/20 px-2 py-0.5 text-white/40">Bientôt</span>
          </div>
          <div className="flex gap-3 text-white/40">
            <Instagram />
            <Heart />
            <Sparkles />
          </div>
          {hasContact ? (
            <div className="mt-5">
              <div className="text-white mb-3">Nous contacter</div>
              <div className="flex gap-3">
                {contactSettings.email.enabled && contactSettings.email.value.trim() && (
                  <a
                    href={buildMailtoLink(contactSettings.email.value.trim())}
                    aria-label="Nous écrire par e-mail"
                    title="Nous écrire par e-mail"
                    className="hover:text-[#8f6075]"
                  >
                    <Mail />
                  </a>
                )}
                {contactSettings.whatsapp.enabled && contactSettings.whatsapp.value.trim() && (
                  <a
                    href={buildWhatsAppLink(contactSettings.whatsapp.value.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Nous écrire sur WhatsApp"
                    title="Nous écrire sur WhatsApp"
                    className="hover:text-[#8f6075]"
                  >
                    <MessageCircle />
                  </a>
                )}
                {contactSettings.signal.enabled && contactSettings.signal.value.trim() && (
                  <a
                    href={buildSignalLink(contactSettings.signal.value.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Nous écrire sur Signal"
                    title="Nous écrire sur Signal"
                    className="hover:text-[#8f6075]"
                  >
                    <Send />
                  </a>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-xs">
        <div>Photos et vidéos © 2026 Zenoria, reproduction interdite sans autorisation. Prototype e-commerce.</div>
        <div className="mt-2 text-[11px] text-white/50">
          Swarovski® est une marque de son propriétaire. Zenoria est une marque indépendante, non affiliée à Swarovski.
        </div>
      </div>
    </footer>
  );
}