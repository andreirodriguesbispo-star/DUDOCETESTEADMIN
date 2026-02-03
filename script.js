import { loadProductsFromFirebase } from "./firebase-products.js";

(async function () {
  /* =========================
     CONFIG
  ========================= */
  const WHATSAPP_NUMBER = "5571988785830";

  // bump version to avoid quebrar carrinho antigo
  const CART_KEY = "dudoce_cart_v2";


let PRODUCTS = [];

try {
  PRODUCTS = await loadProductsFromFirebase();
} catch (err) {
  console.error("[Firestore] Falha ao carregar produtos:", err);
  PRODUCTS = [];
}

// fallback de compatibilidade (se você ainda quiser manter um objeto global antigo)
const DYNAMIC_DESCS = {}; // (opcional) legado
  /* =========================
     Helpers
  ========================= */
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  function onlyDigits(s) {
    return String(s || "").replace(/\D+/g, "");
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function formatBRL(value) {
    const v = Number(value || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = String(msg || "");
    el.setAttribute("data-on", "1");
    window.clearTimeout(toast.__t);
    toast.__t = window.setTimeout(() => el.removeAttribute("data-on"), 1800);
  }

  function stableStringify(obj) {
    // stringify com ordem de chaves estável (para agrupar itens iguais no carrinho)
    if (!obj || typeof obj !== "object") return "";
    const keys = Object.keys(obj).sort();
    const out = {};
    keys.forEach((k) => {
      const v = obj[k];
      if (Array.isArray(v)) out[k] = [...v];
      else out[k] = v;
    });
    return JSON.stringify(out);
  }

  function cartLineKey(id, opts) {
    const o = opts && typeof opts === "object" ? stableStringify(opts) : "";
    return `${String(id || "")}::${o}`;
  }

  /* =========================
     Cart (localStorage)
     item shape:
      { id: "p01", qty: 1, opts: { sabor:"Limão", ... } }
  ========================= */
  function readCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x) => ({
          id: String(x.id || ""),
          qty: clamp(Number(x.qty || 0), 0, 999),
          opts: x && typeof x.opts === "object" && x.opts ? x.opts : null,
        }))
        .filter((x) => x.id && x.qty > 0);
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    const safe = Array.isArray(items) ? items : [];
    localStorage.setItem(CART_KEY, JSON.stringify(safe));
  }

  function cartCount(items) {
    return (items || []).reduce((acc, x) => acc + (Number(x.qty) || 0), 0);
  }

  function setCartQty(id, qty, opts) {
    const items = readCart();
    const key = cartLineKey(id, opts);
    const i = items.findIndex((x) => cartLineKey(x.id, x.opts) === key);

    const nextQty = clamp(Number(qty || 0), 0, 999);

    if (i >= 0) {
      if (nextQty <= 0) items.splice(i, 1);
      else items[i].qty = nextQty;
    } else if (nextQty > 0) {
      items.push({ id, qty: nextQty, opts: opts || null });
    }

    writeCart(items);
    updateCartCount();
    return items;
  }

  function addToCart(id, delta, opts) {
    const items = readCart();
    const key = cartLineKey(id, opts);
    const i = items.findIndex((x) => cartLineKey(x.id, x.opts) === key);
    const cur = i >= 0 ? items[i].qty : 0;
    return setCartQty(id, cur + (Number(delta || 1) || 1), opts);
  }

  function updateCartCount() {
    const n = cartCount(readCart());
    $$("[data-cart-count]").forEach((el) => (el.textContent = String(n)));
  }

  function productById(id) {
    return PRODUCTS.find((p) => p.id === id) || null;
  }


function getHealthyAddon(p) {
    if (!p || !Array.isArray(p.options)) return 0;
    const opt = p.options.find((x) => x && x.key === "restricoes");
    if (!opt || !opt.label) return 0;

    const m = String(opt.label).match(/\+\s*R\$\s*([0-9]+(?:[\.,][0-9]{1,2})?)/i);
    if (!m) return 0;

    // aceita "18,00" ou "18.00"
    const num = m[1].replace(".", "").replace(",", ".");
    const v = Number(num);
    return Number.isFinite(v) ? v : 0;
  }

  function calcUnitPrice(p, opts) {
    if (!p) return 0;
    const o = (opts && typeof opts === "object") ? opts : {};
    // Base: se houver pricing, escolhe por tipo/tamanho; senão, usa p.price
    let base = Number(p.price || 0);

    if (p.pricing) {
      const tipo = String(o.tipo || "Bolo");
      if (tipo === "Fatia" && typeof p.pricing.fatia === "number") {
        base = p.pricing.fatia;
      } else if (p.pricing.bolo) {
        const tam = String(o.tamanho || p.pricing.defaultSize || "");
        if (tam && typeof p.pricing.bolo[tam] === "number") base = p.pricing.bolo[tam];
        else if (typeof p.pricing.base === "number") base = p.pricing.base;
      }
    }

    // Acréscimo: opções saudáveis (quando houver label com "+ R$ XX,XX")
    const hasHealthy = Array.isArray(o.restricoes) && o.restricoes.length > 0;
    const addon = getHealthyAddon(p);
    if (hasHealthy && addon > 0) base += addon;

return base;
  }


    function computeSubtotal(cartItems) {
    return (cartItems || []).reduce((acc, item) => {
      const p = productById(item.id);
      if (!p) return acc;
      const unit = calcUnitPrice(p, item.opts);
      return acc + unit * item.qty;
    }, 0);
  }

  function formatOptsInline(opts) {
    if (!opts || typeof opts !== "object") return "";
    const parts = [];
    Object.keys(opts).forEach((k) => {
      const v = opts[k];
      if (v == null || v === "" || v === "(sem 2º recheio)") return;
      if (Array.isArray(v) && v.length) parts.push(`${k}: ${v.join(", ")}`);
      else if (!Array.isArray(v)) parts.push(`${k}: ${String(v)}`);
    });
    return parts.length ? ` (${parts.join(" • ")})` : "";
  }

  /* =========================
     Header menu (overlay)
  ========================= */
  function initHeader() {
    const tgl = $(".hdTgl");
    const menu = $("#hdMenu");

    function setOpen(open) {
      if (open) document.body.setAttribute("data-hdopen", "");
      else document.body.removeAttribute("data-hdopen");

      if (tgl) tgl.setAttribute("aria-expanded", open ? "true" : "false");
      if (menu) menu.setAttribute("aria-hidden", open ? "false" : "true");
    }

    tgl?.addEventListener("click", () => {
      const open = document.body.hasAttribute("data-hdopen");
      setOpen(!open);
    });

    menu?.addEventListener("click", (e) => {
      if (e.target === menu) setOpen(false);
    });

    $$("[data-hdclose]").forEach((a) => {
      a.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  /* =========================
     Floating: top button
  ========================= */
  function initTopButton() {
    const topBtn = $("[data-fab='top']");
    const onScroll = () => {
      if (window.scrollY > 420) document.body.setAttribute("data-topbtn", "");
      else document.body.removeAttribute("data-topbtn");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    topBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* =========================
     WhatsApp (direto + checkout)
  ========================= */
  function openWhatsApp(text) {
    const msg = encodeURIComponent(String(text || "").trim());
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
    window.open(url, "_blank", "noopener");
  }

  function initDirectWhatsApp() {
    const msg = "Olá! Quero fazer um pedido na Dudôce";
    $$("[data-wa-direct]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openWhatsApp(msg);
      });
    });

    const waFab = $("[data-fab='wa']");
    waFab?.addEventListener("click", (e) => {
      e.preventDefault();
      openWhatsApp(msg);
    });
  }

  /* =========================
     Scroll reveal (delicado)
  ========================= */
  function initReveal() {
    const els = $$("[data-fx]");
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((ent) => {
          if (!ent.isIntersecting) return;
          ent.target.setAttribute("data-fxstate", "in");
          io.unobserve(ent.target);
        });
      },
      { threshold: 0.12 }
    );

    els.forEach((el) => io.observe(el));
  }

  // Home: render "Mais pedidos" (somente 4)
  function initHome() {
    const list = document.getElementById("hmMpList");
    if (!list) return;

    PRODUCTS.slice(0, 4).forEach((p) => {
      const card = document.createElement("article");
      card.setAttribute("data-ui", "pMini");

      const link = document.createElement("a");
      link.href = `produto.html?id=${encodeURIComponent(p.id)}`;
      link.setAttribute("aria-label", `Ver ${p.name}`);

      const img = document.createElement("img");
      img.src = p.imgs[0];
      img.alt = p.name;

      link.appendChild(img);

      const body = document.createElement("div");

      const h3 = document.createElement("h3");
      h3.textContent = p.name;

      const price = document.createElement("p");
      price.textContent = formatBRL(p.price);

      const btn = document.createElement("a");
      btn.href = `produto.html?id=${encodeURIComponent(p.id)}`;
      btn.setAttribute("data-ui", "btn");
      btn.setAttribute("data-variant", "fill");
      btn.textContent = "Comprar";

      body.appendChild(h3);
      body.appendChild(price);
      body.appendChild(btn);

      card.appendChild(link);
      card.appendChild(body);

      list.appendChild(card);
    });
  }

  /* =========================
     Produtos: listagem + filtros
  ========================= */
  function normalizeCat(cat) {
    const c = String(cat || "").toLowerCase();
    if (c === "bolos") return "Bolos";
    if (c === "tortas") return "Tortas";
    if (c === "trufas") return "Trufas";
    if (c === "doces" || c === "doces diversos") return "Doces";
    if (c === "todos") return "Todos";
    return "Todos";
  }

  function initProductsPage() {
    const grid = document.getElementById("prGrid");
    const search = document.getElementById("prSearch");
    const catBtns = $$("[data-catbtn]");

    if (!grid) return;

    const url = new URL(window.location.href);
    const catParam = normalizeCat(url.searchParams.get("cat"));
    const momentParam = String(url.searchParams.get("moment") || "")
      .toLowerCase()
      .trim();

    let activeCat = catParam !== "Todos" ? catParam : "Todos";
    let activeMoment = momentParam || "";

    catBtns.forEach((b) => {
      const cat = normalizeCat(b.getAttribute("data-cat"));
      const on = cat === activeCat || (activeCat === "Todos" && cat === "Todos");
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });

    function match(p) {
      if (activeCat !== "Todos" && p.cat !== activeCat) return false;
      if (activeMoment && !p.tags.includes(activeMoment)) return false;

      const q = String(search?.value || "").trim().toLowerCase();
      if (q) {
        const hay = `${p.name} ${p.cat}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }

    function render() {
      grid.innerHTML = "";
      const filtered = PRODUCTS.filter(match);

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.setAttribute("data-ui", "empty");
        empty.innerHTML = `
          <strong>Nenhum produto encontrado.</strong>
          <p>Tente outro termo de busca ou selecione uma categoria diferente.</p>
          <a href="produtos.html" data-ui="btn" data-variant="fill">Limpar filtros</a>
        `;
        grid.appendChild(empty);
        return;
      }

      filtered.forEach((p) => {
        const card = document.createElement("article");
        card.setAttribute("data-ui", "pCard");

        const a = document.createElement("a");
        a.href = `produto.html?id=${encodeURIComponent(p.id)}`;
        a.setAttribute("aria-label", `Abrir ${p.name}`);

        const img = document.createElement("img");
        img.src = p.imgs[0];
        img.alt = p.name;

        a.appendChild(img);

//Troca de imagem no hover (desktop) e toque (mobile), quando houver 2+ imgs
const baseSrc = (Array.isArray(p.imgs) && p.imgs.length) ? p.imgs[0] : "";
const hoverSrc = (Array.isArray(p.imgs) && p.imgs.length > 1) ? p.imgs[1] : baseSrc;

if (baseSrc && hoverSrc && hoverSrc !== baseSrc) {
  img.style.transition = "opacity 140ms ease";
  const swapTo = (src) => {
    img.style.opacity = "0";
    window.setTimeout(() => {
      img.src = src;
      img.style.opacity = "1";
    }, 70);
  };

  a.addEventListener("mouseenter", () => swapTo(hoverSrc));
  a.addEventListener("mouseleave", () => swapTo(baseSrc));
  a.addEventListener("focus", () => swapTo(hoverSrc));
  a.addEventListener("blur", () => swapTo(baseSrc));

  // mobile: ao tocar, mostra a 2ª foto; ao soltar, volta
  a.addEventListener("touchstart", () => swapTo(hoverSrc), { passive: true });
  a.addEventListener("touchend", () => swapTo(baseSrc), { passive: true });
  a.addEventListener("touchcancel", () => swapTo(baseSrc), { passive: true });
};


        const body = document.createElement("div");

        const h3 = document.createElement("h3");
        h3.textContent = p.name;

        const price = document.createElement("p");
        price.textContent = formatBRL(p.price);

        const btns = document.createElement("div");
        btns.style.display = "grid";
        btns.style.gap = "10px";

        const view = document.createElement("a");
        view.href = `produto.html?id=${encodeURIComponent(p.id)}`;
        view.setAttribute("data-ui", "btn");
        view.setAttribute("data-variant", "fill");
        view.textContent = "Ver produto";

        const add = document.createElement("button");
        add.type = "button";
        add.setAttribute("data-ui", "btn");
        add.setAttribute("data-variant", "outline");
        add.textContent = "Adicionar ao carrinho";
        add.addEventListener("click", () => {
          // se tiver opções, força o usuário a entrar no produto para escolher
          if (Array.isArray(p.options) && p.options.length) {
            toast("Escolha as opções em “Ver produto”.");
            window.location.href = `produto.html?id=${encodeURIComponent(p.id)}`;
            return;
          }
          addToCart(p.id, 1, null);
          toast("Adicionado ao carrinho.");
        });

        btns.appendChild(view);
        btns.appendChild(add);

        body.appendChild(h3);
        body.appendChild(price);
        body.appendChild(btns);

        card.appendChild(a);
        card.appendChild(body);

        grid.appendChild(card);
      });
    }

    catBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        catBtns.forEach((x) => x.setAttribute("aria-pressed", "false"));
        btn.setAttribute("aria-pressed", "true");

        const next = normalizeCat(btn.getAttribute("data-cat"));
        activeCat = next === "Todos" ? "Todos" : next;
        render();
      });
    });

    search?.addEventListener("input", () => render());
    render();
  }

/* =========================
   Produto: detalhe (com opções)
========================= */
function initProductDetail() {
  const mount = document.getElementById("pdMount");
  if (!mount) return;

  const url = new URL(window.location.href);
  const id = String(url.searchParams.get("id") || "").trim();
  const p = productById(id);

  if (!p) {
    mount.innerHTML = `
      <div data-ui="empty">
        <strong>Produto não encontrado.</strong>
        <p>Volte para o cardápio e escolha outra opção.</p>
        <a href="produtos.html" data-ui="btn" data-variant="fill">Ir para o cardápio</a>
      </div>
    `;
    return;
  }

  const wrap = document.createElement("div");
  wrap.setAttribute("data-ui", "pView");

  // Galeria
  const gal = document.createElement("div");
  gal.setAttribute("data-ui", "pGal");

  const stage = document.createElement("div");
  stage.setAttribute("data-ui", "pStage");

  const mainImg = document.createElement("img");
  mainImg.src = p.imgs[0];
  mainImg.alt = p.name;

  stage.appendChild(mainImg);

  const thumbs = document.createElement("div");
  thumbs.setAttribute("data-ui", "pThumbs");

  function setImg(i) {
    const idx = clamp(i, 0, p.imgs.length - 1);
    mainImg.style.opacity = "0";
    window.setTimeout(() => {
      mainImg.src = p.imgs[idx];
      mainImg.style.opacity = "1";
    }, 90);

    $$("button", thumbs).forEach((b, bi) => {
      b.setAttribute("aria-current", bi === idx ? "true" : "false");
    });
  }

  p.imgs.forEach((src, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Ver foto ${i + 1}`);
    b.setAttribute("aria-current", i === 0 ? "true" : "false");

    const im = document.createElement("img");
    im.src = src;
    im.alt = "";

    b.appendChild(im);
    b.addEventListener("click", () => setImg(i));
    // Hover (desktop) + toque (mobile)
    b.addEventListener("mouseenter", () => setImg(i));
    b.addEventListener("focus", () => setImg(i));
    b.addEventListener("touchstart", () => setImg(i), { passive: true });
    thumbs.appendChild(b);
  });

  gal.appendChild(stage);
  gal.appendChild(thumbs);

  // Info
  const info = document.createElement("div");
  info.setAttribute("data-ui", "pInfo");

  const pill = document.createElement("div");
  pill.setAttribute("data-ui", "pPill");
  pill.textContent = p.cat;

  const h1 = document.createElement("h1");
  h1.textContent = p.name;

  const desc = document.createElement("p");
  desc.textContent = p.desc;

  // Opções
  const optsState = {};
  let priceEl = null;
  // ✅ Helper: aplica descrição dinâmica (por produto/opção)
  // Formatos aceitos em `p.dynamicDescs`:
  //  A) { tipo: { Bolo:"...", Fatia:"..." } }
  //  B) { key: "tipo", map: { Bolo:"...", Fatia:"..." } }
  function applyDynamicDesc() {
    const dyn = (p && typeof p === "object") ? p.dynamicDescs : null;

    // formato B
    if (dyn && typeof dyn === "object" && dyn.key && dyn.map && typeof dyn.map === "object") {
      const k = String(dyn.key || "");
      const sel = String(optsState[k] || "");
      const txt = dyn.map[sel] || p.desc;
      desc.textContent = txt || "";
      return;
    }

    // formato A
    if (dyn && typeof dyn === "object") {
      // por padrão, tenta usar a opção "tipo" (mas funciona com qualquer key existente)
      const keyCandidates = Object.keys(dyn);
      for (const k of keyCandidates) {
        const map = dyn[k];
        if (!map || typeof map !== "object") continue;
        const sel = String(optsState[k] || "");
        if (!sel) continue;
        const txt = map[sel];
        if (txt) {
          desc.textContent = String(txt);
          return;
        }
      }
    }

    // fallback legado
    const legacy = (typeof DYNAMIC_DESCS === "object" && DYNAMIC_DESCS) ? DYNAMIC_DESCS[p.id] : null;
    if (legacy) {
      const tipo = String(optsState.tipo || "Bolo");
      desc.textContent = legacy[tipo] || p.desc || "";
      return;
    }

    desc.textContent = p.desc || "";
  }


  function shouldShowOption(opt) {
    if (!opt || !opt.requiredIf) return true;
    const rk = String(opt.requiredIf.key || "");
    const rv = String(opt.requiredIf.value || "");
    return String(optsState[rk] || "") === rv;
  }

  function refreshConditionalOptions() {
    if (!Array.isArray(p.options)) return;
    p.options.forEach((opt) => {
      if (!opt || !opt.requiredIf) return;
      const el = optsBox.querySelector(`[data-opt="${opt.key}"]`);
      if (!el) return;

      const show = shouldShowOption(opt);
      if (!show) {
        el.setAttribute("hidden", "");
        el.open = false;
        // limpa estado para não ir pro carrinho / validação
        delete optsState[opt.key];
      } else {
        el.removeAttribute("hidden");
        // re-sincroniza estado se voltou a aparecer
        if (optsState[opt.key] == null) {
          const sel = el.querySelector("select");
          const inp = el.querySelector('input[type="text"]');
          const cbs = Array.from(el.querySelectorAll('input[type="checkbox"]'));
          if (sel) optsState[opt.key] = sel.value;
          else if (inp) optsState[opt.key] = String(inp.value || "").trim();
          else if (cbs.length) {
            const arr = [];
            cbs.forEach((cb) => { if (cb.checked) arr.push(cb.nextSibling?.textContent || ""); });
            optsState[opt.key] = arr.filter(Boolean);
          }
        }
      }
    });
  }

  function updatePrice() {
    if (!priceEl) return;
    priceEl.textContent = formatBRL(calcUnitPrice(p, optsState));
  }

  function onAnyOptionChange() {
    refreshConditionalOptions();
    updatePrice();
    applyDynamicDesc();
  }

  const optsBox = document.createElement("div");
  optsBox.style.display = "grid";
  optsBox.style.gap = "10px";

  function renderOption(opt, onChange) {
    // wrapper (accordion)
    const details = document.createElement("details");
    details.setAttribute("data-ui", "optAcc");
    details.setAttribute("data-opt", opt.key);

    const summary = document.createElement("summary");
    summary.setAttribute("data-ui", "optSum");

    const left = document.createElement("span");
    left.setAttribute("data-ui", "optSumLab");
    left.textContent = opt.label + (opt.required ? " *" : "");

    const right = document.createElement("span");
    right.setAttribute("data-ui", "optSumVal");
    right.textContent = "";

    summary.appendChild(left);
    summary.appendChild(right);
    details.appendChild(summary);

    const body = document.createElement("div");
    body.setAttribute("data-ui", "optBody");

    function setSummaryFromState() {
      const v = optsState[opt.key];
      if (opt.type === "multiselect") {
        const arr = Array.isArray(v) ? v : [];
        right.textContent = arr.length ? arr.join(", ") : "Selecionar";
      } else if (opt.type === "text") {
        right.textContent = v ? String(v) : "Escrever";
      } else {
        right.textContent = v ? String(v) : "Selecionar";
      }
    }

    function makeSelect() {
      const sel = document.createElement("select");
      sel.setAttribute("data-ui", "optCtl");

      (opt.choices || []).forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        sel.appendChild(o);
      });

      const first = (opt.choices || [])[0];
      optsState[opt.key] = first || "";
      sel.value = optsState[opt.key];

      sel.addEventListener("change", () => {
        optsState[opt.key] = sel.value;
        setSummaryFromState();
        if (onChange) onChange();
      });

      body.appendChild(sel);
      setSummaryFromState();
    }

    function makeMulti() {
      const help = document.createElement("div");
      help.setAttribute("data-ui", "optHelp");
      help.textContent =
        opt.helper || (opt.max ? `Escolha até ${opt.max}.` : "Escolha as opções.");
      body.appendChild(help);

      const wrap = document.createElement("div");
      wrap.setAttribute("data-ui", "optChips");
      if (opt.key === "restricoes") wrap.setAttribute("data-variant", "health");

      optsState[opt.key] = [];

      (opt.choices || []).forEach((c) => {
        const lab2 = document.createElement("label");
        lab2.className = "chip";
        if (opt.key === "restricoes") lab2.classList.add("chip--health");

        const cb = document.createElement("input");
        cb.type = "checkbox";

        cb.addEventListener("change", () => {
          const arr = Array.isArray(optsState[opt.key]) ? optsState[opt.key] : [];
          if (cb.checked) {
            if (opt.max && arr.length >= opt.max) {
              cb.checked = false;
              toast(`Você pode escolher até ${opt.max}.`);
              return;
            }
            arr.push(c);
          } else {
            const idx = arr.indexOf(c);
            if (idx >= 0) arr.splice(idx, 1);
          }
          optsState[opt.key] = arr;
          setSummaryFromState();
          if (onChange) onChange();
        });

        const txt = document.createElement("span");
        txt.className = "chipTxt";
        txt.textContent = c;

        lab2.appendChild(cb);
        lab2.appendChild(txt);
        wrap.appendChild(lab2);
      });

      body.appendChild(wrap);
      setSummaryFromState();
    }

    function makeText() {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = opt.placeholder || "";
      inp.setAttribute("data-ui", "optCtl");

      optsState[opt.key] = "";

      inp.addEventListener("input", () => {
        const v = String(inp.value || "");
        if (opt.maxLen && v.length > opt.maxLen) inp.value = v.slice(0, opt.maxLen);
        optsState[opt.key] = inp.value.trim();
        setSummaryFromState();
        if (onChange) onChange();
      });

      body.appendChild(inp);
      setSummaryFromState();
    }

    if (opt.type === "select") makeSelect();
    else if (opt.type === "multiselect") makeMulti();
    else if (opt.type === "text") makeText();

    details.appendChild(body);
    return details;
  }

  if (Array.isArray(p.options) && p.options.length) {
    const title = document.createElement("div");
    title.style.fontWeight = "800";
    title.style.letterSpacing = ".12em";
    title.style.textTransform = "uppercase";
    title.style.fontSize = "12px";
    title.style.opacity = ".92";
    title.textContent = "Personalize";
    optsBox.appendChild(title);

    p.options.forEach((opt) => {
      optsBox.appendChild(renderOption(opt, onAnyOptionChange));
    });

    // ✅ garante que "tipo" comece como "Bolo" (se existir)
    const tipoOpt = p.options.find((o) => o && o.key === "tipo");
    if (tipoOpt && (optsState.tipo == null || optsState.tipo === "")) {
      optsState.tipo = (tipoOpt.choices && tipoOpt.choices[0]) ? tipoOpt.choices[0] : "Bolo";
    }

    refreshConditionalOptions();
    updatePrice();
    applyDynamicDesc(); // ✅ já inicia com a descrição do BOLO
  }

  const buy = document.createElement("div");
  buy.setAttribute("data-ui", "pBuy");

  const price = document.createElement("div");
  price.setAttribute("data-ui", "pPrice");
  priceEl = price;
  updatePrice();

  // Quantidade
  let qtyValue = 1;

  const qtyBox = document.createElement("div");
  qtyBox.setAttribute("data-ui", "pQty");

  const dec = document.createElement("button");
  dec.type = "button";
  dec.setAttribute("aria-label", "Diminuir quantidade");
  dec.textContent = "−";

  const qtyNum = document.createElement("span");
  qtyNum.textContent = String(qtyValue);

  const inc = document.createElement("button");
  inc.type = "button";
  inc.setAttribute("aria-label", "Aumentar quantidade");
  inc.textContent = "+";

  dec.addEventListener("click", () => {
    qtyValue = Math.max(1, qtyValue - 1);
    qtyNum.textContent = String(qtyValue);
  });

  inc.addEventListener("click", () => {
    qtyValue = Math.min(999, qtyValue + 1);
    qtyNum.textContent = String(qtyValue);
  });

  qtyBox.appendChild(dec);
  qtyBox.appendChild(qtyNum);
  qtyBox.appendChild(inc);

  // Add ao carrinho com quantidade + opções
  const add = document.createElement("button");
  add.type = "button";
  add.setAttribute("data-ui", "btn");
  add.setAttribute("data-variant", "fill");
  add.textContent = "Adicionar ao carrinho";
  add.addEventListener("click", () => {
    // valida required
    if (Array.isArray(p.options)) {
      for (const opt of p.options) {
        let must = !!opt.required;
        if (opt.requiredIf && typeof opt.requiredIf === "object") {
          must = String(optsState[opt.requiredIf.key] || "") === String(opt.requiredIf.value || "");
        }
        if (!must) continue;
        const v = optsState[opt.key];
        const missing =
          v == null ||
          v === "" ||
          (Array.isArray(v) && v.length === 0) ||
          (opt.emptyValue && v === opt.emptyValue);
        if (missing) {
          toast(`Selecione: ${opt.label}.`);
          return;
        }
      }
    }

    // remove campos "vazios"
    const clean = {};
    Object.keys(optsState).forEach((k) => {
      const v = optsState[k];
      if (v == null) return;
      if (Array.isArray(v)) {
        if (v.length) clean[k] = v;
      } else if (String(v).trim() && String(v) !== "(sem 2º recheio)") {
        clean[k] = String(v).trim();
      }
    });

    addToCart(p.id, qtyValue, Object.keys(clean).length ? clean : null);
    toast(`${qtyValue} item(ns) adicionados ao carrinho.`);
  });

  buy.appendChild(price);
  buy.appendChild(qtyBox);
  buy.appendChild(add);

  const goCart = document.createElement("a");
  goCart.href = "carrinho.html";
  goCart.setAttribute("data-ui", "btn");
  goCart.setAttribute("data-variant", "outline");
  goCart.textContent = "Abrir carrinho";

  info.appendChild(pill);
  info.appendChild(h1);
  info.appendChild(desc);

  if (optsBox.childNodes.length) info.appendChild(optsBox);

  info.appendChild(buy);
  info.appendChild(goCart);

  wrap.appendChild(gal);
  wrap.appendChild(info);

  mount.appendChild(wrap);
}

  /* =========================
     Carrinho: render
  ========================= */
  function initCartPage() {
    const mount = document.getElementById("crMount");
    if (!mount) return;

    function render() {
      const items = readCart();

      mount.innerHTML = "";

      if (!items.length) {
        mount.innerHTML = `
          <div data-ui="empty">
            <strong>Seu carrinho está vazio.</strong>
            <p>Escolha alguns itens no cardápio e volte aqui para finalizar.</p>
            <a href="produtos.html" data-ui="btn" data-variant="fill">Ver cardápio</a>
          </div>
        `;
        return;
      }

      const box = document.createElement("div");
      box.setAttribute("data-ui", "cartBox");

      items.forEach((it) => {
        const p = productById(it.id);
        if (!p) return;

        const row = document.createElement("div");
        row.setAttribute("data-ui", "cartItem");

        const img = document.createElement("img");
        img.src = p.imgs[0];
        img.alt = p.name;

        const meta = document.createElement("div");

        const h3 = document.createElement("h3");
        h3.textContent = p.name;

        const sub = document.createElement("p");
        const optsTxt = formatOptsInline(it.opts);
        sub.textContent = `${formatBRL(calcUnitPrice(p, it.opts))} • ${p.cat}${optsTxt}`;

        meta.appendChild(h3);
        meta.appendChild(sub);

        const qty = document.createElement("div");
        qty.setAttribute("data-ui", "qty");

        const dec = document.createElement("button");
        dec.type = "button";
        dec.setAttribute("aria-label", "Diminuir");
        dec.textContent = "−";
        dec.addEventListener("click", () => {
          setCartQty(p.id, it.qty - 1, it.opts);
          render();
        });

        const num = document.createElement("span");
        num.textContent = String(it.qty);

        const inc = document.createElement("button");
        inc.type = "button";
        inc.setAttribute("aria-label", "Aumentar");
        inc.textContent = "+";
        inc.addEventListener("click", () => {
          setCartQty(p.id, it.qty + 1, it.opts);
          render();
        });

        qty.appendChild(dec);
        qty.appendChild(num);
        qty.appendChild(inc);

        row.appendChild(img);
        row.appendChild(meta);
        row.appendChild(qty);

        box.appendChild(row);
      });

      const subtotal = computeSubtotal(items);

      const sum = document.createElement("div");
      sum.setAttribute("data-ui", "cartSum");

      const total = document.createElement("div");
      total.setAttribute("data-ui", "cartTotal");
      total.textContent = `Subtotal: ${formatBRL(subtotal)}`;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "12px";
      actions.style.flexWrap = "wrap";

      const back = document.createElement("a");
      back.href = "produtos.html";
      back.setAttribute("data-ui", "btn");
      back.setAttribute("data-variant", "outline");
      back.textContent = "Adicionar mais itens";

      const go = document.createElement("a");
      go.href = "checkout.html";
      go.setAttribute("data-ui", "btn");
      go.setAttribute("data-variant", "fill");
      go.textContent = "Finalizar";

      actions.appendChild(back);
      actions.appendChild(go);

      sum.appendChild(total);
      sum.appendChild(actions);

      box.appendChild(sum);

      mount.appendChild(box);
    }

    render();
  }

/* =========================
     Checkout
  ========================= */
function calcShipping(cepDigits) {
  const d = onlyDigits(cepDigits).slice(0, 8);
  if (d.length !== 8) {
    return { value: 0, label: "Informe o CEP para simular o frete." };
  }
  if (d.startsWith("404") || d.startsWith("403")) {
    return { value: 8, label: `R$ 8,00` };
  }
  if (d.startsWith("40")) {
    return { value: 12, label: `R$ 12,00` };
  }
  return { value: 18, label: `R$ 18,00` };
}

function maskCEP(v) {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function initCheckoutPage() {
  const form = document.getElementById("ckForm");
  const summary = document.getElementById("ckSummary");
  const shipLine = document.getElementById("ckShipLine");
  const addrLine = document.getElementById("ckAddrLine");
  const deliveryFields = document.getElementById("ckDeliveryFields");
  const pickupInfo = document.getElementById("ckPickupInfo");
  const fulfillRadios = $$('input[name="fulfillment"]');

  // ✅ controla se o CEP foi validado no ViaCEP (somente entrega)
  let cepValido = false;
  let fulfillment = "delivery"; // default

  if (!form || !summary || !shipLine) return;

  // estado do endereço (para exibir e enviar no WhatsApp)
  let cepAddress = null; // {logradouro,bairro,localidade,uf,complemento}

  async function fetchAddressByCEP(cepDigits) {
    const d = onlyDigits(cepDigits).slice(0, 8);
    if (d.length !== 8) return null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.erro) return null;
      return {
        logradouro: data.logradouro || "",
        bairro: data.bairro || "",
        localidade: data.localidade || "",
        uf: data.uf || "",
        complemento: data.complemento || "",
      };
    } catch {
      return null;
    }
  }

  function formatAddr(a) {
    if (!a) return "";
    const parts = [];
    if (a.logradouro) parts.push(a.logradouro);
    if (a.bairro) parts.push(a.bairro);
    const city = [a.localidade, a.uf].filter(Boolean).join("/");
    if (city) parts.push(city);
    return parts.join(" • ");
  }

  // min no calendário = hoje (bloqueia dias passados)
  const dateEl = $("#ckDate");
  if (dateEl) {
    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    dateEl.min = `${yyyy}-${mm}-${dd}`;
  }

  function renderSummary(shipValue) {
    const items = readCart();

    summary.innerHTML = "";

    const t = document.createElement("div");
    t.setAttribute("data-ui", "sumTitle");
    t.textContent = "Resumo do pedido";
    summary.appendChild(t);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.setAttribute("data-ui", "empty");
      empty.innerHTML = `
        <strong>Seu carrinho está vazio.</strong>
        <p>Volte ao cardápio para adicionar itens.</p>
        <a href="produtos.html" data-ui="btn" data-variant="fill">Ir para o cardápio</a>
      `;
      summary.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.setAttribute("data-ui", "sumList");

    items.forEach((it) => {
      const p = productById(it.id);
      if (!p) return;

      const row = document.createElement("div");
      row.setAttribute("data-ui", "sumRow");

      const left = document.createElement("span");
      left.textContent = `${it.qty}× ${p.name}${formatOptsInline(it.opts)}`;

      const right = document.createElement("span");
      right.textContent = formatBRL(calcUnitPrice(p, it.opts) * it.qty);

      row.appendChild(left);
      row.appendChild(right);

      list.appendChild(row);
    });

    summary.appendChild(list);

    const line = document.createElement("div");
    line.setAttribute("data-ui", "sumLine");
    summary.appendChild(line);

    const subtotal = computeSubtotal(items);

    const row1 = document.createElement("div");
    row1.setAttribute("data-ui", "sumRow");
    row1.innerHTML = `<span>Subtotal</span><span>${formatBRL(subtotal)}</span>`;

    const row2 = document.createElement("div");
    row2.setAttribute("data-ui", "sumRow");
    row2.innerHTML = `<span>Frete</span><span>${formatBRL(shipValue)}</span>`;

    summary.appendChild(row1);
    summary.appendChild(row2);

    const line2 = document.createElement("div");
    line2.setAttribute("data-ui", "sumLine");
    summary.appendChild(line2);

    const total = subtotal + shipValue;

    const rowT = document.createElement("div");
    rowT.setAttribute("data-ui", "sumTotal");
    rowT.innerHTML = `<span>Total</span><span>${formatBRL(total)}</span>`;

    summary.appendChild(rowT);
  }

  function getShipValue() {
    if (fulfillment === "pickup") {
      if (shipLine) shipLine.textContent = "Retirada no local (sem frete).";
      return 0;
    }
    const cep = $("#ckCep")?.value || "";
    const ship = calcShipping(cep);
    if (shipLine) shipLine.textContent = ship.label;
    return ship.value;
  }

  function setFulfillment(next) {
    fulfillment = next === "pickup" ? "pickup" : "delivery";

    const cepInput = $("#ckCep");
    const numInput = $("#ckNum");

    if (fulfillment === "pickup") {
      deliveryFields?.setAttribute("hidden", "");
      pickupInfo?.removeAttribute("hidden");

      if (cepInput) {
        cepInput.required = false;
        cepInput.value = "";
      }
      if (numInput) {
        numInput.required = false;
        numInput.value = "";
      }

      cepValido = false;
      cepAddress = null;
      if (addrLine) {
        addrLine.textContent = "";
        addrLine.style.color = "";
      }

      renderSummary(0);
      return;
    }

    // delivery
    pickupInfo?.setAttribute("hidden", "");
    deliveryFields?.removeAttribute("hidden");

    if (cepInput) cepInput.required = true;
    if (numInput) numInput.required = true;

    if (addrLine && !onlyDigits(cepInput?.value || "").length) {
      addrLine.textContent = "Digite o CEP para carregar o endereço.";
      addrLine.style.color = "";
    }

    renderSummary(getShipValue());
  }

  // inicial
  // (garante estado inicial mesmo se mudar o HTML depois)
  const initial = String($('input[name="fulfillment"]:checked')?.value || "delivery");
  setFulfillment(initial);

  fulfillRadios.forEach((r) => {
    r.addEventListener("change", () => {
      const v = String($('input[name="fulfillment"]:checked')?.value || "delivery");
      setFulfillment(v);
    });
  });

  // CEP input -> máscara + recalcula + valida no ViaCEP
  const cepInput = $("#ckCep");
  cepInput?.addEventListener("input", (e) => {
    if (fulfillment !== "delivery") return;
    const v = maskCEP(e.target.value);
    e.target.value = v;
    renderSummary(getShipValue());

    const d = onlyDigits(v);

    // ✅ sempre que editar, assume inválido até validar de novo
    cepValido = false;
    cepAddress = null;

    if (addrLine) {
      if (d.length !== 8) {
        addrLine.textContent = "Digite o CEP para carregar o endereço.";
        addrLine.style.color = "";
        return;
      }

      addrLine.textContent = "Carregando endereço…";
      addrLine.style.color = "";

      fetchAddressByCEP(d).then((addr) => {
        // se o usuário mudou o CEP enquanto carregava, evita “corrida”
        if (onlyDigits($("#ckCep")?.value || "") !== d) return;

        cepAddress = addr;

        if (!addrLine) return;

        if (!addr) {
          cepValido = false;
          addrLine.textContent = "CEP não encontrado. Confira e tente novamente.";
          addrLine.style.color = "#c0392b";
        } else {
          cepValido = true;
          addrLine.textContent = formatAddr(addr);
          addrLine.style.color = "";
        }
      });
    }
  });

  // submit -> WhatsApp
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const items = readCart();
    if (!items.length) {
      toast("Seu carrinho está vazio.");
      return;
    }

    const name = String($("#ckName")?.value || "").trim();
    const cep = String($("#ckCep")?.value || "").trim();
    const num = String($("#ckNum")?.value || "").trim();
    const date = String($("#ckDate")?.value || "").trim();
    const pay = String($("input[name='pay']:checked")?.value || "").trim();
    const how = String($('input[name="fulfillment"]:checked')?.value || "delivery");

    if (!name) {
      toast("Preencha seu nome.");
      $("#ckName")?.focus();
      return;
    }

    // valida endereço apenas se for entrega
    const cepDigits = onlyDigits(cep);
    if (how !== "pickup") {
      if (cepDigits.length !== 8) {
        toast("Digite um CEP válido (8 dígitos).");
        $("#ckCep")?.focus();
        return;
      }

      
      if (!cepValido) {
        toast("Informe um CEP válido para continuar.");
        $("#ckCep")?.focus();
        return;
      }

      if (!num) {
        toast("Digite o número da casa.");
        $("#ckNum")?.focus();
        return;
      }
    }

    if (!date) {
      toast("Selecione a data de entrega.");
      $("#ckDate")?.focus();
      return;
    }

    // bloqueia datas passadas (redundância por segurança)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(date + "T00:00:00");
    if (d < today) {
      toast("Escolha uma data de entrega válida.");
      $("#ckDate")?.focus();
      return;
    }

    if (!pay) {
      toast("Selecione uma forma de pagamento.");
      return;
    }

    const ship = how === "pickup" ? { value: 0, label: "Retirada no local (sem frete)." } : calcShipping(cepDigits);
    const subtotal = computeSubtotal(items);
    const total = subtotal + ship.value;

    const [yy, mm, dd] = date.split("-");
    const dateBR = yy && mm && dd ? `${dd}/${mm}/${yy}` : date;

    const lines = [];
    lines.push("Olá! Quero fazer um pedido na Dudôce.");
    lines.push("");
    lines.push(`Nome: ${name}`);
    if (how === "pickup") {
      lines.push("Recebimento: Retirar no local");
      lines.push("Endereço da loja: Rua Guilherme Marback, 24");
      lines.push(`Data (retirada): ${dateBR}`);
    } else {
      lines.push("Recebimento: Entrega da loja");
      lines.push(`CEP: ${maskCEP(cepDigits)}`);
      if (cepAddress) {
        const addrTxt = formatAddr(cepAddress);
        if (addrTxt) lines.push(`Endereço: ${addrTxt}`);
        if (cepAddress.complemento) lines.push(`Complemento: ${cepAddress.complemento}`);
      }
      lines.push(`Número: ${num}`);
      lines.push(`Data de entrega: ${dateBR}`);
    }
    lines.push(`Pagamento: ${pay}`);
    lines.push("");
    lines.push("Itens:");

    items.forEach((it) => {
      const p = productById(it.id);
      if (!p) return;
      lines.push(
        `- ${it.qty}× ${p.name}${formatOptsInline(it.opts)} — ${formatBRL(calcUnitPrice(p, it.opts) * it.qty)}`
      );
    });

    lines.push("");
    lines.push(`Subtotal: ${formatBRL(subtotal)}`);
    lines.push(`Frete: ${formatBRL(ship.value)}`);
    lines.push(`Total: ${formatBRL(total)}`);
    lines.push("");
    lines.push("Observação: se precisar ajustar horário/detalhes da entrega, combinamos por aqui.");

    openWhatsApp(lines.join("\n"));
  });
}

  /* =========================
     Ano no footer
  ========================= */
  function setYear() {
    const y = new Date().getFullYear();
    $$("[data-year]").forEach((el) => (el.textContent = String(y)));
  }

  /* =========================
     Boot
  ========================= */
  function boot() {
    setYear();
    updateCartCount();

    initHeader();
    initTopButton();
    initDirectWhatsApp();
    initReveal();

    initHome();
    initProductsPage();
    initProductDetail();
    initCartPage();
    initCheckoutPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();


