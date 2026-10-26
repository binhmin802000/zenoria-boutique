import React, { useState } from "react";
import { KeyRound, LogOut, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ============================================================
// « PROFIL & SÉCURITÉ » — e-mail (lecture seule), changement de mot
// de passe, déconnexion de tous les appareils.
//
// Le changement d'adresse e-mail n'est volontairement pas inclus ici :
// "Secure email change" est actif côté Supabase, ce qui exigerait une
// confirmation par e-mail sur les deux adresses — bloqué tant que
// Resend n'est pas opérationnel.
// ============================================================
export default function AccountProfileSection({ user }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [logoutAllBusy, setLogoutAllBusy] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState("");

  const changePassword = async (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword.length < 8) {
      setPasswordError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setPasswordBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      setPasswordSuccess("Votre mot de passe a été modifié.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPasswordError("Impossible de modifier votre mot de passe pour le moment.");
    }
    setPasswordBusy(false);
  };

  const logoutAllDevices = async () => {
    if (!window.confirm("Vous serez déconnectée de tous vos appareils, y compris celui-ci. Continuer ?")) return;
    setLogoutAllBusy(true);
    setLogoutAllError("");
    try {
      const { error: err } = await supabase.auth.signOut({ scope: "global" });
      if (err) throw err;
      window.location.replace("/");
    } catch (e) {
      setLogoutAllError("Impossible de vous déconnecter de tous les appareils pour le moment.");
      setLogoutAllBusy(false);
    }
  };

  return (
    <div data-testid="section-profil-content">
      <h2 className="font-serif text-2xl text-[#412f3b] mb-1">Profil & sécurité</h2>
      <p className="text-sm text-[#8b737e] mb-5">Gérez votre connexion à votre espace Zenoria.</p>

      <div className="rounded-2xl border border-[#eee2e5] p-4 mb-4">
        <h3 className="font-serif text-lg text-[#412f3b] mb-1">Adresse e-mail</h3>
        <p className="text-sm text-[#70656a]">{user.email}</p>
      </div>

      <form onSubmit={changePassword} className="rounded-2xl border border-[#eee2e5] p-4 mb-4">
        <h3 className="font-serif text-lg text-[#412f3b] mb-1 flex items-center gap-2">
          <KeyRound size={16} className="text-[#8f6075]" /> Changer mon mot de passe
        </h3>
        <p className="text-sm text-[#70656a] mb-3">Au moins 8 caractères.</p>

        {passwordError && <div role="alert" className="mb-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{passwordError}</div>}
        {passwordSuccess && <div className="mb-3 rounded-xl bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{passwordSuccess}</div>}

        <div className="space-y-3 mb-3">
          <div className="relative">
            <input
            type={showNewPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nouveau mot de passe"
            data-testid="new-password-input"
            className="w-full rounded-xl border border-[#d9c5cc] px-3 pr-10 h-10 text-sm"
            autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              data-testid="toggle-new-password-input-visibility"
              aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b737e]"
            >
              {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="relative">
            <input
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmer le nouveau mot de passe"
            data-testid="confirm-password-input"
            className="w-full rounded-xl border border-[#d9c5cc] px-3 pr-10 h-10 text-sm"
            autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              data-testid="toggle-confirm-password-input-visibility"
              aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b737e]"
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={passwordBusy}
          data-testid="change-password-btn"
          className="rounded-full bg-[#8f6075] hover:bg-[#71485b] text-white px-4 h-10 text-sm disabled:opacity-50"
        >
          {passwordBusy ? "Modification…" : "Modifier mon mot de passe"}
        </button>
      </form>

      <div className="rounded-2xl border border-[#eee2e5] p-4">
        <h3 className="font-serif text-lg text-[#412f3b] mb-1 flex items-center gap-2">
          <LogOut size={16} className="text-[#8f6075]" /> Déconnexion
        </h3>
        <p className="text-sm text-[#70656a] mb-3">Si vous pensez que votre compte est utilisé ailleurs, déconnectez-vous de tous vos appareils.</p>
        {logoutAllError && <div role="alert" className="mb-3 rounded-xl bg-red-50 text-red-600 px-3 py-2 text-sm">{logoutAllError}</div>}
        <button
          type="button"
          onClick={logoutAllDevices}
          disabled={logoutAllBusy}
          data-testid="logout-all-devices-btn"
          className="rounded-full border border-[#d9c5cc] px-4 h-10 text-sm hover:bg-[#f5edf1] disabled:opacity-50"
        >
          {logoutAllBusy ? "Déconnexion…" : "Se déconnecter de tous les appareils"}
        </button>
      </div>
    </div>
  );
}