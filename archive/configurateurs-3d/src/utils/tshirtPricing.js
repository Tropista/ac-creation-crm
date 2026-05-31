/** Estimation HT indicative pour le configurateur t-shirt (prix client, pas coût atelier). */
const RATE_CM2 = {
  dtf: 0.06,
  uv: 0.09,
  flex: 0.35,
};

const MIN_HT = {
  dtf: 4.5,
  uv: 5,
  flex: 8,
};

export function estimatePrintPriceHT(_item, techniqueKey, widthCm, heightCm) {
  const key = techniqueKey === "uv" || techniqueKey === "flex" ? techniqueKey : "dtf";
  const width = Math.max(0.1, Number(widthCm) || 0);
  const height = Math.max(0.1, Number(heightCm) || 0);
  const areaCm2 = width * height;
  const rate = RATE_CM2[key] || RATE_CM2.dtf;
  const minimum = MIN_HT[key] || MIN_HT.dtf;
  return Number(Math.max(minimum, areaCm2 * rate).toFixed(2));
}
