import { useEffect, useState } from "react"; // ZENORIA_INSTALL_BANNER_V1
import { shouldShowButton, shouldShowBanner, bannerVariant } from "./installPrompt";
import { getInstallState, subscribeInstallState, initInstallPrompt, promptInstall, dismissBanner } from "./installPromptStore";
// ============================================================
// Hook React partagé par le bouton d'installation (SiteHeader) et le bandeau (InstallBanner).
// Les deux appellent ce hook ; les deux lisent et agissent sur le MÊME magasin d'état
// (lib/installPromptStore.js), donc installer ou fermer depuis l'un des deux met immédiatement à
// jour l'autre, sans configuration supplémentaire côté page.
// ============================================================
export function useInstallPrompt() {
  const [state, setState] = useState(getInstallState);

  useEffect(() => {
    initInstallPrompt(); // sans effet si déjà fait par un autre composant monté avant
    setState(getInstallState()); // au cas où l'initialisation synchrone aurait déjà changé l'état
    return subscribeInstallState(setState);
  }, []);

  return {
    canInstall: Boolean(state.deferredPrompt) && !state.installed,
    isIos: state.isIos,
    installed: state.installed,
    standalone: state.standalone,
    dismissed: state.dismissed,
    showButton: shouldShowButton({ canInstall: Boolean(state.deferredPrompt) && !state.installed, installed: state.installed }),
    showBanner: shouldShowBanner({
      canInstall: Boolean(state.deferredPrompt) && !state.installed,
      isIos: state.isIos,
      installed: state.installed,
      standalone: state.standalone,
      dismissed: state.dismissed,
      delayElapsed: state.delayElapsed,
    }),
    variant: bannerVariant({ canInstall: Boolean(state.deferredPrompt) && !state.installed, isIos: state.isIos }),
    promptInstall,
    dismissBanner,
  };
}
