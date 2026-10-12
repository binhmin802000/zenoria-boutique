// Charge les fichiers de lib/ en modules, quelle que soit la version de Node :
// ils sont copiés dans un dossier temporaire qui déclare « type: module » (le projet, lui, n'a pas à le faire).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(here, "..", "lib");
const FILES = ["colorEngine.js", "quizOutfits.js", "quizState.js", "shopUtils.js"];
let tmp = null;

export async function loadLib(name) {
  if (!tmp) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zenoria-lib-"));
    fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"module"}');
    for (const f of FILES) fs.copyFileSync(path.join(libDir, f), path.join(tmp, f));
    process.on("exit", () => {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* nettoyage : sans importance */ }
    });
  }
  return import(pathToFileURL(path.join(tmp, name)).href);
}

// Mini lanceur de tests : test(nom, fonction) puis await finish() — les fonctions asynchrones sont attendues
export function makeRunner() {
  let passed = 0;
  const failures = [];
  const pending = [];
  const fail = (name, err) => failures.push(name + "\n      " + String(err && err.message).split("\n").slice(0, 4).join("\n      "));
  return {
    test(name, fn) {
      try {
        const r = fn();
        if (r && typeof r.then === "function") pending.push(r.then(() => { passed++; }, (err) => fail(name, err)));
        else passed++;
      } catch (err) {
        fail(name, err);
      }
    },
    async finish(label) {
      await Promise.all(pending);
      if (failures.length) console.log("\nÉCHECS (" + failures.length + ")\n  - " + failures.join("\n  - "));
      console.log((label ? label + " : " : "") + passed + " réussis, " + failures.length + " échec(s)");
      process.exit(failures.length ? 1 : 0);
    },
  };
}
