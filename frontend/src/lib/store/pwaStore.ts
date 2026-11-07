import { create } from "zustand";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface PwaState {
  installPrompt: InstallPrompt | null;
  iosInstallAvailable: boolean;
  updateWorker: ServiceWorker | null;
  updating: boolean;
}
export const usePwaStore = create<PwaState>(() => ({
  installPrompt: null, iosInstallAvailable: false, updateWorker: null, updating: false,
}));

let initialized = false;
export function applyPwaUpdate() {
  const worker = usePwaStore.getState().updateWorker;
  if (!worker) return;
  if (worker.state !== "installed") {
    window.location.reload();
    return;
  }
  usePwaStore.setState({ updating: true });
  worker.postMessage({ type: "SKIP_WAITING" });
}

export async function initializePwa() {
  if (initialized || !("serviceWorker" in navigator)) return;
  initialized = true;
  const installed = window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true);
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  usePwaStore.setState({ iosInstallAvailable: ios && !installed });
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    usePwaStore.setState({ installPrompt: event as InstallPrompt });
  });
  window.addEventListener("appinstalled", () => {
    usePwaStore.setState({ installPrompt: null, iosInstallAvailable: false });
  });
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (usePwaStore.getState().updating) window.location.reload();
    else if (hadController) usePwaStore.setState({ updateWorker: navigator.serviceWorker.controller });
    hadController = true;
  });
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    if (registration.waiting) usePwaStore.setState({ updateWorker: registration.waiting });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          usePwaStore.setState({ updateWorker: worker });
        }
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void registration.update().catch(() => {});
    });
  } catch {
    console.warn("pwa_registration_failed");
  }
}
