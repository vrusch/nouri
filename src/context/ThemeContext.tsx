import { useEffect, useState } from "react";
import { ThemeContext } from "./ThemeContextBase";

export type Theme = "light" | "dark" | "system";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("nouri-theme") as Theme) || "system"
  );

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (themeToApply: Theme) => {
      root.classList.remove("light", "dark");

      if (themeToApply === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(themeToApply);
      }
    };

    applyTheme(theme);
    localStorage.setItem("nouri-theme", theme);

    // Sledování změny systémového tématu, pokud je nastaveno "system"
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
