export function safeJsonParse(value) {
  try {
    return JSON.parse(String(value));
  } catch (_e) {
    return null;
  }
}

export async function filesToDataUrls(fileList, maxCount = 3) {
  const files = Array.from(fileList || []).filter((f) => String(f.type || "").startsWith("image/"));
  const picked = files.slice(0, maxCount);
  return Promise.all(
    picked.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Impossible de lire l'image."));
          reader.readAsDataURL(file);
        })
    )
  );
}

export function patientAssistantMeta(persona) {
  const key = String(persona || "DOCTOR").toUpperCase();
  if (key === "NURSE") {
    return { label: "Infirmier", subject: "nurse" };
  }
  if (key === "OWL") {
    return { label: "Hibou", subject: "hibou" };
  }
  if (key === "RESCUE_DOG") {
    return { label: "Chien de secours", subject: "chien" };
  }
  // DOCTOR (patient) -> fichier image en "docter" (orthographe dans tes assets)
  return { label: "Docteur", subject: "docter" };
}

export function indicatorToChibiImagePrefix(level) {
  const t = String(level || "GREEN").toUpperCase();
  // Tes assets suivent :
  //   GREEN   -> `Chibi_Calm_{subject}.png` (avec C majuscule)
  //   ORANGE  -> `chibi_jaune_{subject}.png`
  //   RED     -> `chibi_rouge_{subject}.png`
  if (t === "RED") return "chibi_rouge_";
  if (t === "ORANGE") return "chibi_jaune_";
  return "Chibi_Calm_";
}
