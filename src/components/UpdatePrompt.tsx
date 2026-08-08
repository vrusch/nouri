import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const checkForUpdate = () => registration.update().catch(() => {});
      setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
      window.addEventListener("focus", checkForUpdate);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-300">Je k dispozici nová verze appky.</p>
        <button
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-all active:scale-[0.98]"
        >
          Aktualizovat
        </button>
      </div>
    </div>
  );
}
