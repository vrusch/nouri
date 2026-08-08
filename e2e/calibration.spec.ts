import { test, expect, type Page } from "@playwright/test";
import { calculateNutrition, calibrateTarget } from "../src/lib/nutrition";

/**
 * E2E test pro adaptivní kalibraci kalorického cíle (Stats.tsx).
 *
 * Běží proti reálnému produkčnímu Firebase projektu (appka nemá emulátory nastavené) —
 * vytváří izolovaný, jednorázový testovací účet (email/heslo, ne Google — žádné riziko
 * prolnutí se skutečným účtem), naseje mu syntetickou historii vážení/jídel přes reálný
 * appkový kód (stejná technika jako při ruční verifikaci), a na konci účet i všechna
 * data zase smaže. Spouští se jen na vyžádání (`npm run test:e2e`), ne v běžném CI běhu
 * lintu/buildu — každý běh stojí drobné reálné volání OpenAI (gpt-4o-mini) přes nasazené
 * Cloud Functions (denní pozdrav na Home se generuje automaticky při načtení).
 */

const TEST_PASSWORD = "PlaywrightTest2026!";

// Syntetický profil zvolený tak, aby BMR floor pojistka NEzasáhla a odchylka kalibrace
// byla jasně nad 10% prahem — stejný scénář jako v src/lib/nutrition.test.ts.
const PROFILE = {
  gender: "female" as const,
  weight: 80,
  height: 165,
  birthDate: "1996-06-15",
  activityLevel: 1.2,
  goal: "lose" as const,
};

const WEIGHT_SPAN_DAYS = 21;
const WEIGHT_START = 80;
const WEIGHT_END = 77.5;
const DAILY_CALORIES = 1700;

function uniqueTestEmail(): string {
  return `e2e-calibration-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

async function seedHistoricalData(page: Page) {
  await page.evaluate(
    async ({ weightStart, weightEnd, span, dailyKcal }) => {
      const { auth } = await import("/src/lib/firebase.ts");
      const { logWeight } = await import("/src/lib/cloudSync.ts");
      const { db } = await import("/src/db/db.ts");

      const uid = auth.currentUser!.uid;

      function addDaysInPage(base: string, days: number): string {
        const d = new Date(`${base}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().split("T")[0];
      }

      const today = new Date().toISOString().split("T")[0];
      const start = addDaysInPage(today, -span);

      // Reálné vážení (source: "manual") — appka odvodí kalibraci jen z těchto dvou bodů.
      await logWeight(uid, weightStart, start, "manual");
      await logWeight(uid, weightEnd, today, "manual");

      // `span` dní jídla, dnešek necháváme prázdný (jako reálný uživatel, co se dnes ještě nenajedl).
      for (let i = span; i >= 1; i--) {
        const date = addDaysInPage(today, -i);
        await db.meals.add({
          name: "E2E test meal",
          value: dailyKcal,
          time: "19:00",
          date,
          type: "dinner",
          source: "manual",
          syncId: crypto.randomUUID(),
        });
      }
    },
    { weightStart: WEIGHT_START, weightEnd: WEIGHT_END, span: WEIGHT_SPAN_DAYS, dailyKcal: DAILY_CALORIES }
  );
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
    for (const n of await listDocs(`users/${uid}/weightLogs`)) await deleteDocByName(n);
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

test("kalibrace cíle: našeje historii, ověří návrh a jeho zápis", async ({ page }) => {
  const email = uniqueTestEmail();

  // Očekávané hodnoty počítáme stejnou funkcí, co používá appka — žádná zakódovaná
  // magická čísla, test zůstane platný i když se formulka/prahy v budoucnu změní.
  const expectedNutrition = calculateNutrition(PROFILE);
  const today = new Date().toISOString().split("T")[0];
  const startDate = addDays(today, -WEIGHT_SPAN_DAYS);
  const expectedCalibration = calibrateTarget(
    [
      { date: startDate, weight: WEIGHT_START },
      { date: today, weight: WEIGHT_END },
    ],
    Array.from({ length: WEIGHT_SPAN_DAYS }, (_, i) => ({
      date: addDays(startDate, i + 1),
      calories: DAILY_CALORIES,
    })),
    PROFILE.goal,
    expectedNutrition.bmr,
    expectedNutrition.tdee
  );
  expect(expectedCalibration, "testovací scénář musí sám o sobě vyvolat návrh kalibrace").not.toBeNull();

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

      await page.locator('input[type="date"]').fill(PROFILE.birthDate);
      await page.locator('input[type="number"]').nth(0).fill(String(PROFILE.height));
      await page.locator('input[type="number"]').nth(1).fill(String(PROFILE.weight));
      await page.getByRole("button", { name: "Pokračovat" }).click();

      await page.getByRole("button", { name: "Nízká" }).click();
      await page.getByRole("button", { name: "Už skoro hotovo" }).click();

      await page.getByRole("button", { name: "Hubnout" }).click();
      await page.getByRole("button", { name: "Vše nastaveno" }).click();

      await expect(page.getByText("Zbývá ti")).toBeVisible();
    });

    await test.step("Home ukazuje formulkový cíl před kalibrací", async () => {
      await expect(page.getByText(`${expectedNutrition.targetCalories}`).first()).toBeVisible();
    });

    await test.step("naseje syntetickou historii váhy a jídel", async () => {
      await seedHistoricalData(page);
    });

    await test.step("Stats zobrazí kartu kalibrace se správnými čísly a zápis funguje", async () => {
      await page.getByRole("button", { name: "Statistiky" }).click();

      await expect(page.getByText("Kalibrace cíle podle dat")).toBeVisible();
      await expect(page.getByText(`${expectedCalibration!.estimatedTDEE} kcal`)).toBeVisible();

      const applyButton = page.getByRole("button", {
        name: `Upravit cíl na ${expectedCalibration!.suggestedTargetCalories} kcal`,
      });
      await expect(applyButton).toBeVisible();
      await applyButton.click();

      // Karta zmizí, protože po zápisu se nový odhad shoduje s aktuálním cílem.
      await expect(page.getByText("Kalibrace cíle podle dat")).not.toBeVisible();
      await expect(page.getByText(`Cíl: ${expectedCalibration!.suggestedTargetCalories} kcal/den`)).toBeVisible();
    });

    await test.step("kalibrovaný cíl se promítne i na Home", async () => {
      await page.getByRole("button", { name: "Domů" }).click();
      await expect(page.getByText(`${expectedCalibration!.suggestedTargetCalories}`).first()).toBeVisible();
    });
  } finally {
    await cleanupAccount(page);
  }
});
