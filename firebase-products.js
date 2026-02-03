// firebase-products.js (ESM)
// Responsável por carregar produtos do Firestore para o site público.

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

/**
 * Firebase Console > Project settings > Your apps > Web app
 */
const firebaseConfig = {
  apiKey: "AIzaSyAlfyKYN1Aq0_tja-ClmQ8NodOT0syCyLo",
  authDomain: "dudoce-admin.firebaseapp.com",
  projectId: "dudoce-admin",
  storageBucket: "dudoce-admin.firebasestorage.app",
  messagingSenderId: "418271617542",
  appId: "1:418271617542:web:c9114ea4ab543597619987",
};

// Evita erro de "app já inicializado" em hot reload / múltiplas páginas
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

/* -------------------------
   Normalização (tolerante)
-------------------------- */
function toNum(v, fallback = 0) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function toArrCsv(v) {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Lê a coleção "products" e devolve um array de produtos.
 * - Garante `id` (usa doc.id se faltar)
 * - Garante `imgs` e `tags` como array
 * - Converte números principais
 */
export async function fetchProducts() {
  const snap = await getDocs(collection(db, "products"));
  return snap.docs.map((d) => {
    const data = d.data() || {};
    const p = { ...data };

    // id (preferimos o campo salvo; se não tiver, usa docId)
    if (!p.id) p.id = d.id;

    // arrays
    p.imgs = toArrCsv(p.imgs);
    p.tags = toArrCsv(p.tags);

    // números
    p.price = toNum(p.price, 0);
    p.stockQty = toNum(p.stockQty, 0);

    // options: garantir array
    if (!Array.isArray(p.options)) p.options = [];

    // pricing: se vier string, tenta parse
    if (typeof p.pricing === "string") {
      try { p.pricing = JSON.parse(p.pricing); } catch { p.pricing = null; }
    }

    // dynamicDescs: suporte opcional
    if (typeof p.dynamicDescs === "string") {
      try { p.dynamicDescs = JSON.parse(p.dynamicDescs); } catch { /* ignora */ }
    }

    return p;
  });
}

/**
 * Carrega produtos já prontos para o site:
 * - filtra `active !== false`
 * - filtra sem nome/id
 * - fallback de imagem
 */
export async function loadProductsFromFirebase() {
  const list = await fetchProducts();
  return list
    .filter(p => p && p.id && p.name && p.active !== false)
    .map(p => {
      if (!Array.isArray(p.imgs) || !p.imgs.length) p.imgs = ["IMG/placeholder.jpg"];
      return p;
    });
}
