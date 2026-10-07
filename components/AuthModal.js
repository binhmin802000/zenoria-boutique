import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

// Traduit les messages d'erreur Supabase en français.
function translateError(message) {
  if (!message) return "Une erreur est survenue. Merci de réessayer.";
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("user already registered")) return "Un compte existe déjà avec cet e-mail.";
  if (m.includes("password should be at least")) return "Le mot de passe doit contenir au moins 6 caractères.";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "Adresse e-mail invalide.";
  if (m.includes("rate limit")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  return "Une erreur est survenue. Merci de réessayer.";
}

export default function AuthModal({ open, onClose }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const resetFields = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setInfo("");
    setShowPassword(false);
  };

  const switchMode = (next) => {
    setMode(next);
    resetFields();
  };

  const handleClose = () => {
    resetFields();
    setMode("login");
    onClose();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(translateError(err.message));
    } else {
      handleClose();
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) {
      setError(translateError(err.message));
    } else {
      setInfo("Compte créé ! Vérifiez votre boîte e-mail pour confirmer votre inscription.");
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (err) {
      setError(translateError(err.message));
    } else {
      setInfo("E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[60] inset-x-4 top-[8%] max-w-md mx-auto bg-[#fbf8f4] rounded-[2rem] shadow-2xl p-8 max-h-[84vh] overflow-y-auto"
          >
            <button className="absolute right-5 top-5" onClick={handleClose}>
              <X />
            </button>

            <div className="text-xs uppercase tracking-[.3em] text-[#9c7285] mb-2">Zenoria</div>
            <h3 className="font-serif text-3xl mb-6">
              {mode === "login" && "Connexion"}
              {mode === "signup" && "Créer un compte"}
              {mode === "reset" && "Mot de passe oublié"}
            </h3>

            {error && (
              <div className="mb-4 text-sm rounded-xl bg-red-50 text-red-600 px-4 py-3">{error}</div>
            )}
            {info && (
              <div className="mb-4 text-sm rounded-xl bg-emerald-50 text-emerald-700 px-4 py-3">{info}</div>
            )}

            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />
                  <input
                    type="email"
                    required
                    placeholder="Adresse e-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-4 py-3 outline-none focus:border-[#8f6075]"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-11 py-3 outline-none focus:border-[#8f6075]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9a7384]"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  className="text-xs text-[#8f6075] underline"
                >
                  Mot de passe oublié ?
                </button>
                <Button type="submit" disabled={loading} className="w-full rounded-full h-12 bg-[#8f6075] hover:bg-[#71485b]">
                  {loading ? "Connexion..." : "Se connecter"}
                </Button>
                <p className="text-sm text-center text-[#70656a]">
                  Pas encore de compte ?{" "}
                  <button type="button" onClick={() => switchMode("signup")} className="text-[#8f6075] underline">
                    Créer un compte
                  </button>
                </p>
              </form>
            )}

            {mode === "signup" && (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />
                  <input
                    type="email"
                    required
                    placeholder="Adresse e-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-4 py-3 outline-none focus:border-[#8f6075]"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Mot de passe (6 caractères min.)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-11 py-3 outline-none focus:border-[#8f6075]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9a7384]"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Confirmer le mot de passe"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-4 py-3 outline-none focus:border-[#8f6075]"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full rounded-full h-12 bg-[#8f6075] hover:bg-[#71485b]">
                  {loading ? "Création..." : "Créer mon compte"}
                </Button>
                <p className="text-sm text-center text-[#70656a]">
                  Déjà un compte ?{" "}
                  <button type="button" onClick={() => switchMode("login")} className="text-[#8f6075] underline">
                    Se connecter
                  </button>
                </p>
              </form>
            )}

            {mode === "reset" && (
              <form onSubmit={handleReset} className="space-y-4">
                <p className="text-sm text-[#70656a]">
                  Indiquez votre adresse e-mail, nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </p>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9a7384]" size={18} />
                  <input
                    type="email"
                    required
                    placeholder="Adresse e-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-full border border-[#eadfe4] pl-11 pr-4 py-3 outline-none focus:border-[#8f6075]"
                  />
                </div>
                <Button type="submit" disabled={loading} className="w-full rounded-full h-12 bg-[#8f6075] hover:bg-[#71485b]">
                  {loading ? "Envoi..." : "Envoyer le lien"}
                </Button>
                <p className="text-sm text-center text-[#70656a]">
                  <button type="button" onClick={() => switchMode("login")} className="text-[#8f6075] underline">
                    Retour à la connexion
                  </button>
                </p>
              </form>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
