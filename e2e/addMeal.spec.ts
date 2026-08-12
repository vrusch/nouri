import { test, expect, type Page } from "@playwright/test";

/**
 * E2E regresní test pro rozbalovací "+" tlačítko v BottomNav (satelity Foto/Hlas/Text).
 *
 * Regrese, kterou tenhle test hlídá: zavírací overlay menu (`aria-label="Zavřít nabídku"`)
 * neměl explicitní z-index, takže v malování překryl celý panel navigace i se satelity —
 * klik na kterýkoliv satelit dopadl na overlay (jen zavřel menu), ne na tlačítko pod ním.
 * Objeveno ručně 2026-08-12, oprava v BottomNav.tsx (`z-20` na panel). Playwrightův `.click()`
 * sám o sobě ověřuje dosažitelnost cíle kliku (selže, pokud něco jiné klik zachytí), takže
 * tenhle test regresi odhalí i bez ručního `elementFromPoint` dolování.
 *
 * Běží proti reálnému produkčnímu Firebase projektu stejně jako calibration.spec.ts (appka
 * nemá emulátory) — vlastní izolovaný jednorázový účet, na konci smazaný i s daty. Na rozdíl
 * od calibration.spec.ts nikdy nedokončí AI analýzu (jen ověřuje, že klik na satelit spustí
 * správnou akci), takže žádné volání OpenAI navíc kromě automatického denního pozdravu na
 * Home (stejná drobná cena jako u calibration.spec.ts).
 */

const TEST_PASSWORD = "PlaywrightTest2026!";

function uniqueTestEmail(): string {
  return `e2e-addmeal-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

/** Zavře AddMealModal kliknutím na overlay mimo kartu modalu (X tlačítko nemá aria-label). */
async function closeAddMealModal(page: Page) {
  await page.locator('div[class*="bg-black/50"]').first().click({ position: { x: 10, y: 10 } });
}

/** Otevře satelitní menu a klikne na satelit podle jeho aria-label (Foto/Hlas/Text). */
async function openAddMealMenu(page: Page) {
  await page.getByRole("button", { name: "Přidat jídlo", exact: true }).click();
}

/** Smaže testovací účet i všechna jeho data (Firestore + lokální Dexie). Best-effort. */
async function cleanupAccount(page: Page) {
  await page.evaluate(async () => {
    const { auth } = await import("/src/lib/firebase.ts");
    const { db: dexieDb } = await import("/src/db/db.ts");

    const user = auth.currentUser;
    if (!user) return;

    const uid = user.uid;
    const token = await user.getIdToken();
    const projectId = auth.app.options.projectId;

    async function listDocs(path: string): Promise<string[]> {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      return ((json.documents || []) as { name: string }[]).map((d) => d.name);
    }
    async function deleteDocByName(name: string) {
      await fetch(`https://firestore.googleapis.com/v1/${name}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    for (const n of await listDocs(`users/${uid}/meals`)) await deleteDocByName(n);
    await deleteDocByName(`projects/${projectId}/databases/(default)/documents/users/${uid}`);

    await dexieDb.meals.clear();

    try {
      await user.delete();
    } catch {
      // Vyžaduje čerstvé přihlášení — data jsou už smazaná, osiřelý auth účet bez dat
      // je zanedbatelný zbytkový dluh, nestojí za komplikaci re-authu v cleanupu.
    }
  });
}

test("rozbalovací + tlačítko: satelity Foto/Hlas/Text reálně otevřou AddMealModal", async ({ page }) => {
  const email = uniqueTestEmail();

  try {
    await test.step("registrace testovacího účtu", async () => {
      await page.goto("/");
      await page.getByText("Nemáš účet? Zaregistruj se").click();
      await page.getByPlaceholder("Email").fill(email);
      await page.getByPlaceholder("Heslo").fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Zaregistrovat se" }).click();
    });

    await test.step("onboarding se syntetickým profilem", async () => {
      await page.getByPlaceholder("Tvoje jméno").fill("E2E Test");
      await page.getByRole("button", { name: "Žena" }).click();
      await page.getByRole("button", { name: "Pokračovat" }).click();

      await page.locator('input[type="date"]').fill("1996-06-15");
      await page.locator('input[type="number"]').nth(0).fill("165");
      await page.locator('input[type="number"]').nth(1).fill("65");
      await page.getByRole("button", { name: "Pokračovat" }).click();

      await page.getByRole("button", { name: "Nízká" }).click();
      await page.getByRole("button", { name: "Už skoro hotovo" }).click();

      await page.getByRole("button", { name: "Hubnout" }).click();
      await page.getByRole("button", { name: "Vše nastaveno" }).click();

      await expect(page.getByText("Zbývá ti")).toBeVisible();
    });

    await test.step("satelit Foto spustí výběr fotky", async () => {
      await openAddMealMenu(page);
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Foto", exact: true }).click(),
      ]);
      expect(chooser).toBeTruthy();
      await expect(page.getByRole("heading", { name: "Přidat jídlo" })).toBeVisible();
      await closeAddMealModal(page);
    });

    await test.step("satelit Hlas spustí žádost o mikrofon", async () => {
      await openAddMealMenu(page);
      await page.getByRole("button", { name: "Hlas", exact: true }).click();
      // Playwright bez explicitního grantPermissions žádost na mikrofon automaticky
      // zamítne (žádný hang na neexistující nativní dialog) — appka na to reaguje
      // vlastní hláškou, což zároveň dokazuje, že getUserMedia reálně proběhlo.
      await expect(page.getByText("Nepodařilo se získat přístup k mikrofonu")).toBeVisible();
      await closeAddMealModal(page);
    });

    await test.step("satelit Text rovnou otevře popis jídla", async () => {
      await openAddMealMenu(page);
      await page.getByRole("button", { name: "Text", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Popiš jídlo" })).toBeVisible();
      await expect(page.getByPlaceholder(/dvě vejce na měkko/)).toBeVisible();
      await closeAddMealModal(page);
    });
  } finally {
    await cleanupAccount(page);
  }
});
