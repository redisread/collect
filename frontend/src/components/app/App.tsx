import { ThemeController } from "./common/ThemeToggle";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ThreeColumnLayout } from "./layout/ThreeColumnLayout";
import { KeyboardShortcuts } from "./common/KeyboardShortcuts";
import { PersonalSettings } from "./PersonalSettings";
import { useArticleStore } from "@/lib/store/articleStore";

export default function App({ initialPage = "reader" }: { initialPage?: "reader" | "settings" }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [readerVisited, setReaderVisited] = useState(initialPage === "reader");

  useEffect(() => {
    const navigate = () => {
      const nextPage = window.location.pathname.replace(/\/$/, "") === "/settings" ? "settings" : "reader";
      setPage(nextPage);
      if (nextPage === "reader") setReaderVisited(true);
    };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);

  useEffect(() => {
    document.title = page === "settings" ? "个人设置 · Collect" : "Collect RSS Reader";
    if (page === "reader") {
      Array.from(document.querySelectorAll<HTMLElement>('a[href="/settings"]'))
        .find(link => link.getClientRects().length > 0)?.focus();
    }
  }, [page]);

  useEffect(() => {
    if (!isAuthenticated || page !== "reader") return;
    const refresh = () => {
      const store = useArticleStore.getState();
      if (!store.isLoadingPreference && !store.isTranslating && !store.isExtracting) {
        void store.loadTargetLanguage().catch(() => {});
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [isAuthenticated, page]);

  useEffect(() => {
    authClient.getSession().then((session) => {
      if (session?.data?.user) {
        setIsAuthenticated(true);
      } else {
        window.location.href = "/login";
      }
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-main)]">
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <>
      <ThemeController />
      {page === "reader" && <KeyboardShortcuts />}
      {readerVisited && <div hidden={page !== "reader"} inert={page !== "reader"}>
        <ThreeColumnLayout />
      </div>}
      {page === "settings" && <PersonalSettings />}
    </>
  );
}
