/* ==========================================================================
   حُجرية بريس (Hujariya Press) — المحرك البرمجي الشامل للموقع العام
   [الجزء الأول من 2]:
   - نظام أونلاين نقي 100% في الذاكرة الحية (Zero Local/Session Storage Caching)
   - الدرع السيبراني: تطهير بيانات الكادر والإعدادات + مُطهّر HTML ضد XSS
   - الفهرسة القياسية لمحركات البحث و Google News (Dynamic Schema.org JSON-LD)
   - شريط الطقس الحي (30 مدينة) + شريط الأسواق والطاقة + شريط العاجل المستمر
   - الواجهة الكبرى الزجاجية + موجز النبض + المرئيات القصيرة (9:16) + زاوية الكُتّاب
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  updateDoc,
  increment,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==================== 1. حارس النطاق الفرعي وإعداد الاتصال بـ Firebase ====================
if (
  typeof window !== "undefined" &&
  window.location.hostname.startsWith("www.") &&
  window.location.hostname.split(".").length > 3
) {
  const cleanHost = window.location.hostname.replace(/^www\./i, "");
  window.location.replace(
    `${window.location.protocol}//${cleanHost}${window.location.pathname}${window.location.search}`
  );
}

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAd4Df_Fpp2GlGkRPyvmKuFW68LbL_a4yU",
  authDomain: "rawi-01.firebaseapp.com",
  databaseURL: "https://rawi-01-default-rtdb.firebaseio.com",
  projectId: "rawi-01",
  storageBucket: "rawi-01.firebasestorage.app",
  messagingSenderId: "91203142966",
  appId: "1:91203142966:web:a44f7c06c98529a57a9f97",
  measurementId: "G-2VNWNSZLBJ"
};

const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);

const DEFAULT_BRAND_COLOR = "#b80d38";
const INITIAL_BATCH_SIZE = 20;
const DECK_CARDS_PER_SLIDE = 4;

// غلاف بصري مدمج عالي الدقة يظهر للأخبار التي نُشرت بدون صورة
const FALLBACK_POST_COVER_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#b80d38"/>
          <stop offset="100%" stop-color="#2b030d"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#bg)"/>
      <circle cx="1060" cy="110" r="250" fill="rgba(255,255,255,0.05)"/>
      <circle cx="140" cy="570" r="310" fill="rgba(255,255,255,0.04)"/>
      <text x="600" y="335" fill="#ffffff" font-family="Almarai, sans-serif" font-size="74" font-weight="800" text-anchor="middle">حُجرية بريس</text>
      <text x="600" y="405" fill="rgba(255,255,255,0.82)" font-family="Alexandria, sans-serif" font-size="28" font-weight="600" text-anchor="middle">Hujariya Press</text>
    </svg>
  `);

// الأقسام الافتراضية المعتمدة بدقة
const DEFAULT_COMPASSES = [
  {
    id: "yemen-politics",
    name: "السياسة اليمنية",
    subcategories: [
      "الشرعية ومؤسسات الدولة",
      "التحليلات الاستراتيجية",
      "الشأن المحلي والمحافظات",
      "كشف زيف الميليشيات"
    ],
    visible: true,
    order: 1
  },
  {
    id: "saudi-politics",
    name: "السياسة السعودية",
    subcategories: [
      "الأمن القومي المشترك",
      "الدبلوماسية الإقليمية",
      "رؤية المملكة 2030",
      "المشاريع التنموية"
    ],
    visible: true,
    order: 2
  },
  {
    id: "regional-international",
    name: "إقليمي ودولي",
    subcategories: ["الشرق الأوسط", "السياسة الدولية", "أمن البحر الأحمر والممرات"],
    visible: true,
    order: 3
  },
  {
    id: "economy-dev",
    name: "اقتصاد وأسواق",
    subcategories: ["أسواق وعملات", "طاقة ونفط", "إعمار وتنمية", "بورصات عالمية"],
    visible: true,
    order: 4
  },
  {
    id: "sports",
    name: "الرياضة",
    subcategories: ["الكرة اليمنية", "الدوري السعودي", "الكرة العالمية", "بطولات دولية"],
    visible: true,
    order: 5
  },
  {
    id: "health-science",
    name: "صحة وعلوم وفضاء",
    subcategories: ["طب وصحة", "أبحاث الفضاء والفلك", "اكتشافات علمية", "بيئة ومناخ"],
    visible: true,
    order: 6
  },
  {
    id: "tech-future",
    name: "تقنية ومستقبل",
    subcategories: ["الذكاء الاصطناعي", "الأمن السيبراني", "تطبيقات ومنصات", "ابتكارات"],
    visible: true,
    order: 7
  },
  {
    id: "culture-thought",
    name: "ثقافة وفكر",
    subcategories: ["أدب وفكر", "تاريخ وهوية", "قراءات وكتب", "مقالات الرأي"],
    visible: true,
    order: 8
  },
  {
    id: "art-media",
    name: "فن وإعلام",
    subcategories: ["فن ودراما", "إعلام رقمي", "تراث وفنون"],
    visible: true,
    order: 9
  }
];

// قائمة الـ 30 مدينة يمنية وسعودية وعربية لشريط الطقس الحي
const REGIONAL_WEATHER_CITIES = [
  { name: "صنعاء", lat: 15.3694, lon: 44.191, temp: 24, code: 1 },
  { name: "عدن", lat: 12.7855, lon: 45.0187, temp: 31, code: 0 },
  { name: "تعز", lat: 13.5795, lon: 44.0209, temp: 26, code: 1 },
  { name: "الحجرية", lat: 13.3167, lon: 44.0833, temp: 23, code: 2 },
  { name: "إب", lat: 13.9667, lon: 44.1833, temp: 22, code: 2 },
  { name: "الحديدة", lat: 14.7978, lon: 42.9545, temp: 33, code: 0 },
  { name: "مأرب", lat: 15.4591, lon: 45.3253, temp: 30, code: 0 },
  { name: "المكلا", lat: 14.5425, lon: 49.1242, temp: 31, code: 1 },
  { name: "سيئون", lat: 15.943, lon: 48.7873, temp: 32, code: 0 },
  { name: "شبوة", lat: 14.5333, lon: 46.8333, temp: 29, code: 0 },
  { name: "المهرة", lat: 16.2167, lon: 52.1833, temp: 30, code: 1 },
  { name: "سقطرى", lat: 12.6488, lon: 53.9863, temp: 29, code: 1 },
  { name: "الضالع", lat: 13.6957, lon: 44.7314, temp: 25, code: 1 },
  { name: "لحج", lat: 13.0567, lon: 44.8819, temp: 31, code: 0 },
  { name: "ذمار", lat: 14.5427, lon: 44.4051, temp: 21, code: 1 },
  { name: "صعدة", lat: 16.9402, lon: 43.7639, temp: 24, code: 0 },
  { name: "الرياض", lat: 24.7136, lon: 46.6753, temp: 32, code: 0 },
  { name: "مكة", lat: 21.3891, lon: 39.8579, temp: 35, code: 0 },
  { name: "المدينة", lat: 24.5247, lon: 39.5692, temp: 33, code: 0 },
  { name: "جدة", lat: 21.4858, lon: 39.1925, temp: 32, code: 1 },
  { name: "الدمام", lat: 26.4207, lon: 50.0888, temp: 31, code: 0 },
  { name: "أبها", lat: 18.2164, lon: 42.5053, temp: 22, code: 2 },
  { name: "جازان", lat: 16.8892, lon: 42.5511, temp: 33, code: 1 },
  { name: "نجران", lat: 17.4924, lon: 44.1277, temp: 29, code: 0 },
  { name: "القاهرة", lat: 30.0444, lon: 31.2357, temp: 28, code: 0 },
  { name: "الدوحة", lat: 25.2854, lon: 51.531, temp: 32, code: 0 },
  { name: "أبوظبي", lat: 24.4539, lon: 54.3773, temp: 33, code: 0 },
  { name: "مسقط", lat: 23.588, lon: 58.3829, temp: 31, code: 0 },
  { name: "الكويت", lat: 29.3759, lon: 47.9774, temp: 31, code: 0 },
  { name: "عمّان", lat: 31.9539, lon: 35.9106, temp: 25, code: 1 }
];

// مؤشرات الأسواق العالمية والطاقة
const GLOBAL_MARKETS_DATA = [
  { id: "gold", name: "الذهب (أونصة)", price: 2748.40, unit: "$", change: +0.64 },
  { id: "brent", name: "نفط برنت", price: 76.85, unit: "$", change: +0.92 },
  { id: "wti", name: "خام تكساس", price: 73.10, unit: "$", change: +0.78 },
  { id: "silver", name: "الفضة", price: 33.65, unit: "$", change: +1.15 },
  { id: "tasi", name: "تاسي السعودي", price: 12145.80, unit: "", change: +0.42 },
  { id: "dow", name: "داو جونز", price: 43890.25, unit: "", change: -0.18 }
];

const DEFAULT_ABOUT_HTML = `
  <h3>عن منصة حُجرية بريس (Hujariya Press)</h3>
  <p>منصة إخبارية وتحليلية مستقلة تندرج تحت مظلة مؤسسة <strong>RAWI-YE.COM</strong> الإعلامية الرقمية، تُعنى بتقديم الخبر الدقيق والتغطيات الميدانية والتحليلات الاستراتيجية المعمقة في الشأن اليمني والإقليمي والدولي.</p>
`;

const DEFAULT_CHARTER_HTML = `
  <h3>أولاً: المصداقية والتحقق المهني</h3>
  <p>تلتزم هيئة التحرير وجميع الكتّاب في <strong>حُجرية بريس</strong> بأعلى معايير الدقة والموضوعية، والتثبت من المصادر قبل نشر أي مادة إخبارية أو تحليلية.</p>
  <h3>ثانياً: المسؤولية الوطنية والأخلاقية</h3>
  <p>تحترم المنصة الثوابت الوطنية والقيم المهنية، وتفصل فصلاً تاماً بين الخبر الصحفي المجرد وبين مقالات الرأي والتحليل.</p>
`;

const DEFAULT_PRIVACY_HTML = `
  <h3>سياسة الخصوصية وحماية البيانات</h3>
  <p>تحترم منصة <strong>حُجرية بريس</strong> خصوصية القراء والزوار، وتعمل بنظام التصفح المباشر الآمن دون تخزين أي بيانات شخصية في أجهزة الزوار، مع الالتزام التام بمعايير الأمان الرقمي وحقوق الملكية الفكرية.</p>
`;

// ==================== 2. الحالة المركزية في الذاكرة الحية فقط (In-Memory RAM State) ====================
const state = {
  settings: {
    siteName: "حُجرية بريس",
    siteDescription: "منصة إخبارية وتحليلية شاملة تندرج تحت مظلة مؤسسة RAWI-YE.COM الإعلامية الرقمية.",
    accentColor: DEFAULT_BRAND_COLOR,
    hideSiteName: false,
    logoUrl: "",
    headerLogoUrl: "",
    sidebarLogoUrl: "",
    footerLogoUrl: "",
    defaultPostImageUrl: "",
    faviconUrl: "",
    appIconUrl: "",
    charterHtml: DEFAULT_CHARTER_HTML,
    aboutHtml: DEFAULT_ABOUT_HTML,
    privacyHtml: DEFAULT_PRIVACY_HTML,
    socials: {}
  },
  compasses: structuredClone(DEFAULT_COMPASSES),
  posts: [],
  lastVisiblePostDoc: null,
  hasMorePosts: true,
  isFetchingBatch: false,
  publicStaff: [],
  ads: [],
  weatherCities: structuredClone(REGIONAL_WEATHER_CITIES),
  markets: structuredClone(GLOBAL_MARKETS_DATA),
  activeCategory: "all",
  activeSubcategory: "",
  activeSpecialFilter: "", // "" | "pulse-only" | "shorts-only"
  activeTag: "",
  activeAuthorKey: "",
  searchQuery: "",
  deckSlideIndex: 0,
  deckTotalSlides: 1,
  deckAutoTimer: null,
  currentReadingPostId: null,
  readerFontScale: 1, // 0.92 | 1 | 1.14 | 1.24
  viewedGuard: new Set() // في الذاكرة الحية RAM فقط لمنع تكرار المشاهدات أثناء الجلسة
};

// ==================== 3. الدرع السيبراني: تطهير البيانات ومنع هجمات XSS ====================
function escapeHtml(str = "") {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html = "") {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeHttpUrl(rawUrl = "") {
  const clean = String(rawUrl || "").trim();
  if (!clean) return false;
  if (clean.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(clean, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// مُطهّر HTML السيبراني: يزيل أي سكريبت أو حدث خبيث ويحافظ على تنسيق المقالات
function sanitizeEditorialHtml(dirtyHtml = "") {
  if (!dirtyHtml) return "";
  try {
    const parser = new DOMParser();
    const docNode = parser.parseFromString(String(dirtyHtml), "text/html");

    const forbiddenSelectors = [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "meta",
      "link",
      "base"
    ];
    docNode.querySelectorAll(forbiddenSelectors.join(",")).forEach((el) => el.remove());

    const allowedTags = new Set([
      "P",
      "BR",
      "H2",
      "H3",
      "H4",
      "STRONG",
      "B",
      "EM",
      "I",
      "U",
      "BLOCKQUOTE",
      "UL",
      "OL",
      "LI",
      "FIGURE",
      "FIGCAPTION",
      "IMG",
      "A",
      "SPAN",
      "DIV"
    ]);

    const walkAndClean = (root) => {
      const children = Array.from(root.children || []);
      children.forEach((el) => {
        if (!allowedTags.has(el.tagName)) {
          const textNode = docNode.createTextNode(el.textContent || "");
          el.replaceWith(textNode);
          return;
        }

        Array.from(el.attributes).forEach((attr) => {
          const attrName = attr.name.toLowerCase();
          const attrVal = String(attr.value || "").trim();

          if (el.tagName === "IMG" && (attrName === "src" || attrName === "alt")) {
            if (attrName === "src" && !isSafeHttpUrl(attrVal)) {
              el.remove();
            }
            return;
          }

          if (el.tagName === "A" && attrName === "href") {
            if (!isSafeHttpUrl(attrVal)) {
              el.removeAttribute("href");
            } else {
              el.setAttribute("target", "_blank");
              el.setAttribute("rel", "noopener noreferrer");
            }
            return;
          }

          if (attrName === "class" && el.classList.contains("inline-article-figure")) {
            return;
          }

          el.removeAttribute(attr.name);
        });

        walkAndClean(el);
      });
    };

    walkAndClean(docNode.body);
    return docNode.body.innerHTML;
  } catch (_) {
    return `<p>${escapeHtml(stripHtml(dirtyHtml))}</p>`;
  }
}

// بتر كافة البيانات السرية للكادر وإبقاء البطاقة العامة فقط
function stripSensitiveStaffData(rawMember = {}, docId = "") {
  return {
    id: docId || String(rawMember.id || ""),
    name: String(rawMember.name || "هيئة التحرير").trim(),
    jobTitle: String(rawMember.jobTitle || "صحفي ومحرر في حُجرية بريس").trim(),
    bio: String(rawMember.bio || "").trim(),
    avatar: isSafeHttpUrl(rawMember.avatar) ? String(rawMember.avatar).trim() : "",
    verified: Boolean(rawMember.verified || rawMember.isMasterAdmin)
  };
}

// بتر كلمات المرور والرموز السرية ومفتاح الـ API من الإعدادات في الذاكرة
function stripSensitiveSettingsData(rawSettings = {}) {
  const safeCopy = { ...rawSettings };
  delete safeCopy.masterUsername;
  delete safeCopy.masterPassword;
  delete safeCopy.masterPin;
  delete safeCopy.imgbbApiKey;
  return safeCopy;
}

// تطهير بيانات الخبر وإزالة معرفات الكاتب السرية
function stripSensitivePostData(rawPost = {}, docId = "") {
  const copy = { ...rawPost, id: docId || rawPost.id };
  delete copy.authorPressId;
  delete copy.authorUsername;
  delete copy.deleteReason;
  return copy;
}

function markItemViewedInRam(key) {
  if (!key || state.viewedGuard.has(key)) return false;
  state.viewedGuard.add(key);
  return true;
}

// ==================== 4. الدوال المساعدة، وقت القراءة، والشعارات المحمية ====================
function cleanCategoryName(name = "") {
  return (
    String(name || "")
      .replace(/^بوصلة\s+/i, "")
      .replace(/^البوصلة\s+/i, "")
      .trim() || name
  );
}

function showToast(msg) {
  const toast = document.getElementById("pub-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(window.__pubToastTimer);
  window.__pubToastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3100);
}

function debounce(fn, delay = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function getTimestampMs(item) {
  if (!item) return 0;
  const t = item.createdAt || item.updatedAt || item.createdTimestamp;
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  const parsed = new Date(t).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function formatArabicDate(msOrItem) {
  const ms = typeof msOrItem === "number" ? msOrItem : getTimestampMs(msOrItem);
  if (!ms) return "منذ قليل";
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec >= 0 && diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `منذ ${mins} د`;
  }
  if (diffSec >= 3600 && diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return `منذ ${hrs} س`;
  }
  return new Date(ms).toLocaleDateString("ar-YE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

// حساب وقت القراءة التقديري بناءً على عدد كلمات المقال
function calculateReadingTimeText(post) {
  const plainText = `${post?.title || ""} ${post?.summary || ""} ${stripHtml(
    post?.content || ""
  )}`.trim();
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  const minutes = Math.max(1, Math.ceil(wordCount / 190));
  if (minutes === 1) return "قراءة في دقيقة واحدة";
  if (minutes === 2) return "قراءة في دقيقتين";
  if (minutes <= 10) return `قراءة في ${minutes} دقائق`;
  return `قراءة في ${minutes} دقيقة`;
}

function getCleanBaseSiteUrl() {
  const origin = window.location.origin.replace("://www.", "://");
  const path = window.location.pathname.replace(/index\.html$/i, "");
  return `${origin}${path}`.replace(/\/+$/, "");
}

function getCleanPostShareUrl(postId) {
  return `${getCleanBaseSiteUrl()}/?post=${encodeURIComponent(postId)}`;
}

function resolvePostImage(post) {
  const postImg = String(post?.imageUrl || "").trim();
  if (isSafeHttpUrl(postImg)) return postImg;
  const defImg = String(
    state.settings.defaultPostImageUrl || state.settings.coverImageUrl || ""
  ).trim();
  if (isSafeHttpUrl(defImg)) return defImg;
  return FALLBACK_POST_COVER_SVG;
}

function extractPostCategoriesList(post) {
  const rawList = Array.isArray(post?.categories) && post.categories.length
    ? post.categories
    : post?.category
    ? [post.category]
    : ["أخبار"];
  const cleaned = rawList
    .map((c) => cleanCategoryName(c))
    .filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : ["أخبار"];
}

function isShortVerticalPost(post) {
  if (!post?.videoUrl) return false;
  const url = String(post.videoUrl).toLowerCase();
  return post.videoType === "short_vertical" || url.includes("/shorts/");
}

function resolvePublicAuthor(post) {
  const matched = state.publicStaff.find((s) => {
    if (post?.authorId && s.id === post.authorId) return true;
    if (
      post?.author &&
      String(s.name || "").trim() === String(post.author || "").trim()
    ) {
      return true;
    }
    return false;
  });

  const name = matched?.name || post?.author || "هيئة التحرير";
  const verified = Boolean(matched?.verified || post?.authorVerified);
  const jobTitle = matched?.jobTitle || "صحفي ومحرر في حُجرية بريس";
  const bio =
    matched?.bio ||
    `كاتب ومحرر صحفي في منصة ${state.settings.siteName || "حُجرية بريس"}.`;
  const rawAvatar = matched?.avatar || post?.authorAvatar || "";
  const avatar = isSafeHttpUrl(rawAvatar)
    ? rawAvatar
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(
        name
      )}&background=b80d38&color=fff`;

  return {
    id: matched?.id || post?.authorId || "",
    key: matched?.id || name,
    name,
    verified,
    jobTitle,
    bio,
    avatar
  };
}

function hexToRgbTuple(hex = DEFAULT_BRAND_COLOR) {
  const clean = String(hex).replace("#", "").trim();
  if (clean.length !== 6) return "184, 13, 56";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "184, 13, 56";
  return `${r}, ${g}, ${b}`;
}

function darkenHexColor(hex = DEFAULT_BRAND_COLOR, factor = 0.76) {
  const clean = String(hex).replace("#", "").trim();
  if (clean.length !== 6) return "#8e0729";
  const r = Math.max(0, Math.floor(parseInt(clean.slice(0, 2), 16) * factor));
  const g = Math.max(0, Math.floor(parseInt(clean.slice(2, 4), 16) * factor));
  const b = Math.max(0, Math.floor(parseInt(clean.slice(4, 6), 16) * factor));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function bindSafeLogoImage(imgId, capsuleId, rawUrl) {
  const imgEl = document.getElementById(imgId);
  const capEl = capsuleId ? document.getElementById(capsuleId) : null;
  if (!imgEl) return;

  const cleanUrl = String(rawUrl || "").trim();
  if (!isSafeHttpUrl(cleanUrl)) {
    imgEl.removeAttribute("src");
    imgEl.classList.add("hidden");
    capEl?.classList.add("hidden");
    return;
  }

  imgEl.onload = () => {
    imgEl.classList.remove("hidden");
    capEl?.classList.remove("hidden");
  };

  imgEl.onerror = () => {
    imgEl.removeAttribute("src");
    imgEl.classList.add("hidden");
    capEl?.classList.add("hidden");
  };

  imgEl.src = cleanUrl;
}

// ==================== 5. الهوية الديناميكية + منصات التواصل الـ 10 + الفهرسة JSON-LD ====================
function applyDynamicIdentityAndMeta(context = { type: "home", post: null, title: "" }) {
  const s = state.settings;
  const rawColor = (s.accentColor || "").trim();
  const primaryColor =
    !rawColor || rawColor.toLowerCase() === "#ef3327"
      ? DEFAULT_BRAND_COLOR
      : rawColor;
  const rgb = hexToRgbTuple(primaryColor);
  const darkColor = darkenHexColor(primaryColor, 0.76);

  const root = document.documentElement;
  root.style.setProperty("--brand-primary", primaryColor);
  root.style.setProperty("--brand-dark", darkColor);
  root.style.setProperty("--brand-soft", `rgba(${rgb}, 0.08)`);
  root.style.setProperty("--brand-border", `rgba(${rgb}, 0.22)`);
  root.style.setProperty("--brand-glow", `0 12px 30px -8px rgba(${rgb}, 0.2)`);

  document.getElementById("pub-theme-color")?.setAttribute("content", primaryColor);

  const siteName =
    s.siteName && s.siteName !== "شبكة البوصلة" && s.siteName !== "نبض اليمن"
      ? s.siteName
      : "حُجرية بريس";
  const siteDesc =
    s.siteDescription ||
    "منصة إخبارية وتحليلية شاملة تندرج تحت مظلة مؤسسة RAWI-YE.COM الإعلامية الرقمية.";

  ["header-site-name", "sidebar-site-name", "footer-site-name", "footer-copy-name"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = siteName;
    }
  );

  ["sidebar-site-desc", "footer-site-desc"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = siteDesc;
  });

  const yearEl = document.getElementById("footer-copy-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const dateEl = document.getElementById("header-date-display");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString("ar-YE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  const headerLogo = (s.headerLogoUrl || s.logoUrl || "").trim();
  const sidebarLogo = (s.sidebarLogoUrl || s.authLogoUrl || headerLogo).trim();
  const footerLogo = (s.footerLogoUrl || headerLogo).trim();

  bindSafeLogoImage("header-logo-img", "header-logo-capsule", headerLogo);
  bindSafeLogoImage("sidebar-logo-img", "sidebar-logo-capsule", sidebarLogo);
  bindSafeLogoImage("footer-logo-img", "footer-logo-capsule", footerLogo);

  const headerTextWrap = document.getElementById("header-text-wrap");
  if (headerTextWrap) {
    headerTextWrap.classList.toggle(
      "hidden",
      Boolean(s.hideSiteName && isSafeHttpUrl(headerLogo))
    );
  }

  const fav = (s.faviconUrl || s.appIconUrl || headerLogo || "").trim();
  if (isSafeHttpUrl(fav)) {
    document.getElementById("pub-dynamic-favicon")?.setAttribute("href", fav);
    document.getElementById("pub-dynamic-apple-icon")?.setAttribute("href", fav);
  }

  renderSocialLinksInDom();
  updateDynamicSeoAndSchema(context);
}

// دعم منصات التواصل الـ 10 كاملة مع فحص الأمان
function renderSocialLinksInDom() {
  const soc = state.settings.socials || {};
  const platforms = [
    { key: "whatsapp", label: "واتساب", url: soc.whatsapp },
    { key: "telegram", label: "تليجرام", url: soc.telegram },
    { key: "x", label: "منصة X", url: soc.x || soc.twitter },
    { key: "facebook", label: "فيسبوك", url: soc.facebook },
    { key: "youtube", label: "يوتيوب", url: soc.youtube },
    { key: "tiktok", label: "تيك توك", url: soc.tiktok },
    { key: "instagram", label: "إنستغرام", url: soc.instagram },
    { key: "threads", label: "ثريدز", url: soc.threads },
    { key: "snapchat", label: "سناب شات", url: soc.snapchat },
    { key: "linkedin", label: "لينكدإن", url: soc.linkedin }
  ].filter((item) => isSafeHttpUrl(item.url));

  const sideSec = document.getElementById("sidebar-socials-section");
  const sideWrap = document.getElementById("sidebar-socials-list");
  const footWrap = document.getElementById("footer-socials-row");

  if (!platforms.length) {
    sideSec?.classList.add("hidden");
    if (sideWrap) sideWrap.innerHTML = "";
    if (footWrap) footWrap.innerHTML = "";
    return;
  }

  const html = platforms
    .map(
      (item) =>
        `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="x-social-pill">${escapeHtml(
          item.label
        )}</a>`
    )
    .join("");

  sideSec?.classList.remove("hidden");
  if (sideWrap) sideWrap.innerHTML = html;
  if (footWrap) footWrap.innerHTML = html;
}

// الفهرسة الكاملة لمحركات البحث و Google News (Schema.org JSON-LD & SEO)
function updateDynamicSeoAndSchema(context = { type: "home", post: null, title: "" }) {
  const s = state.settings;
  const siteName =
    s.siteName && s.siteName !== "شبكة البوصلة" && s.siteName !== "نبض اليمن"
      ? s.siteName
      : "حُجرية بريس";
  const siteDesc =
    s.siteDescription ||
    "منصة إخبارية وتحليلية شاملة تندرج تحت مظلة مؤسسة RAWI-YE.COM الإعلامية الرقمية.";
  const baseUrl = getCleanBaseSiteUrl();
  const defaultCover =
    s.defaultPostImageUrl ||
    s.headerLogoUrl ||
    s.logoUrl ||
    `${baseUrl}/og-cover.jpg`;

  let pageTitle = `${siteName} | Hujariya Press — منصة إخبارية وتحليلية شاملة`;
  let pageDesc = siteDesc;
  let pageKeywords =
    "حجرية بريس, Hujariya Press, أخبار اليمن, السياسة اليمنية, السياسة السعودية, تعز, الحجرية, RAWI-YE.COM";
  let pageUrl = `${baseUrl}/`;
  let pageImg = defaultCover;
  let ogType = "website";
  let schemaObj = null;

  if (context.type === "article" && context.post) {
    const post = context.post;
    const author = resolvePublicAuthor(post);
    const cats = extractPostCategoriesList(post);
    const pubMs = getTimestampMs(post) || Date.now();
    const modMs = getTimestampMs({ createdAt: post.updatedAt }) || pubMs;

    pageTitle = `${post.title} | ${siteName}`;
    pageDesc = post.summary || stripHtml(post.content).slice(0, 180) || siteDesc;
    pageUrl = getCleanPostShareUrl(post.id);
    pageImg = resolvePostImage(post);
    ogType = "article";

    if (Array.isArray(post.tags) && post.tags.length) {
      pageKeywords = [...cats, ...post.tags, siteName, "Hujariya Press"].join(", ");
    }

    schemaObj = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": pageUrl
      },
      headline: String(post.title || "").slice(0, 110),
      description: pageDesc,
      image: [pageImg],
      datePublished: new Date(pubMs).toISOString(),
      dateModified: new Date(modMs).toISOString(),
      articleSection: cats[0] || "أخبار",
      keywords: pageKeywords,
      author: {
        "@type": "Person",
        name: author.name,
        jobTitle: author.jobTitle
      },
      publisher: {
        "@type": "NewsMediaOrganization",
        name: siteName,
        url: `${baseUrl}/`,
        logo: {
          "@type": "ImageObject",
          url: defaultCover
        }
      }
    };
  } else if (context.type === "collection" && context.title) {
    pageTitle = `${context.title} | ${siteName}`;
    pageDesc = `تصفح أحدث الأخبار والتقارير في ${context.title} عبر منصة ${siteName}.`;
    pageUrl = `${baseUrl}/${window.location.search || ""}`;
    schemaObj = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: pageTitle,
      description: pageDesc,
      url: pageUrl,
      isPartOf: {
        "@id": `${baseUrl}/#website`
      }
    };
  } else {
    schemaObj = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: pageTitle,
      description: pageDesc,
      url: pageUrl
    };
  }

  document.title = pageTitle;
  document.getElementById("pub-meta-desc")?.setAttribute("content", pageDesc);
  document.getElementById("pub-meta-keywords")?.setAttribute("content", pageKeywords);
  document.getElementById("pub-canonical-link")?.setAttribute("href", pageUrl);
  document.getElementById("og-type")?.setAttribute("content", ogType);
  document.getElementById("og-site-name")?.setAttribute("content", siteName);
  document.getElementById("og-title")?.setAttribute("content", pageTitle);
  document.getElementById("og-desc")?.setAttribute("content", pageDesc);
  document.getElementById("og-url")?.setAttribute("content", pageUrl);
  document.getElementById("og-image")?.setAttribute("content", pageImg);
  document.getElementById("tw-title")?.setAttribute("content", pageTitle);
  document.getElementById("tw-desc")?.setAttribute("content", pageDesc);
  document.getElementById("tw-image")?.setAttribute("content", pageImg);

  const schemaEl = document.getElementById("dynamic-jsonld-schema");
  if (schemaEl && schemaObj) {
    schemaEl.textContent = JSON.stringify(schemaObj);
  }
}

// ==================== 6. الأشرطة التلفزيونية المستمرة (الطقس 30 مدينة + الأسواق + العاجل) ====================
function getWeatherConditionLabel(wmoCode = 0) {
  const code = Number(wmoCode);
  if (code === 0) return "صافي";
  if (code === 1 || code === 2) return "غائم جزئياً";
  if (code === 3) return "غائم";
  if (code >= 45 && code <= 48) return "ضباب";
  if (code >= 51 && code <= 67) return "ممطر";
  if (code >= 80 && code <= 99) return "أمطار رعدية";
  return "معتدل";
}

function renderWeatherTickerTrack() {
  const track = document.getElementById("regional-weather-track");
  if (!track) return;

  const groupHtml = state.weatherCities
    .map(
      (c) => `
      <span class="x-weather-chip">
        <span class="x-weather-city">${escapeHtml(c.name)}</span>
        <span class="x-weather-temp">${Math.round(Number(c.temp) || 25)}°C</span>
        <span>(${escapeHtml(getWeatherConditionLabel(c.code))})</span>
        <span style="opacity:0.35;">•</span>
      </span>
    `
    )
    .join("");

  // تكرار المجموعة مرتين لضمان الحركة التلفزيونية المستمرة السلسة بدون فراغ
  track.innerHTML = `
    <div class="x-ticker-group">${groupHtml}</div>
    <div class="x-ticker-group" aria-hidden="true">${groupHtml}</div>
  `;
}

async function fetchLiveWeatherForCitiesInMemory() {
  renderWeatherTickerTrack();
  try {
    const lats = state.weatherCities.map((c) => c.lat).join(",");
    const lons = state.weatherCities.map((c) => c.lon).join(",");
    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current_weather=true`;
    const response = await fetch(apiUrl);
    if (!response.ok) return;
    const data = await response.json();
    const results = Array.isArray(data) ? data : [data];

    results.forEach((item, idx) => {
      if (state.weatherCities[idx] && item?.current_weather) {
        state.weatherCities[idx].temp = item.current_weather.temperature;
        state.weatherCities[idx].code = item.current_weather.weathercode;
      }
    });

    renderWeatherTickerTrack();
  } catch (_) {
    // في حال ضعف الإنترنت يبقى الشريط يعمل بالقيم الافتراضية في الذاكرة الحية
  }
}

function renderGlobalMarketsTicker() {
  const track = document.getElementById("global-markets-track");
  if (!track) return;

  const groupHtml = state.markets
    .map((m) => {
      const isUp = m.change >= 0;
      const sign = isUp ? "+" : "";
      const formattedPrice = Number(m.price).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return `
        <span class="x-market-chip">
          <span class="x-market-name">${escapeHtml(m.name)}</span>
          <span class="x-market-val">${formattedPrice}${escapeHtml(m.unit)}</span>
          <span class="x-market-change ${isUp ? "up" : "down"}">${sign}${m.change.toFixed(
        2
      )}%</span>
          <span style="opacity:0.35;">•</span>
        </span>
      `;
    })
    .join("");

  track.innerHTML = `
    <div class="x-ticker-group">${groupHtml}</div>
    <div class="x-ticker-group" aria-hidden="true">${groupHtml}</div>
  `;
}

function startMarketsLiveSimulationInMemory() {
  renderGlobalMarketsTicker();
  setInterval(() => {
    state.markets.forEach((m) => {
      const deltaPercent = (Math.random() - 0.49) * 0.08;
      m.change = Number((m.change + deltaPercent).toFixed(2));
      m.price = Number((m.price * (1 + deltaPercent / 100)).toFixed(2));
    });
    renderGlobalMarketsTicker();
  }, 24000);
}

function renderBreakingNewsBar() {
  const bar = document.getElementById("breaking-news-bar");
  const track = document.getElementById("breaking-ticker-track");
  if (!bar || !track) return;

  const now = Date.now();
  const breakingPosts = getPublishedPostsOnly().filter(
    (p) => p.isBreaking && (!p.breakingExpiresAt || Number(p.breakingExpiresAt) > now)
  );

  if (!breakingPosts.length) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");
  const itemsHtml = breakingPosts
    .slice(0, 10)
    .map(
      (p) => `
      <span class="x-breaking-item" data-open-post="${escapeHtml(p.id)}">
        <span>${escapeHtml(p.title)}</span>
        <span style="opacity:0.65;">✦</span>
      </span>
    `
    )
    .join("");

  track.innerHTML = `
    <div class="x-ticker-group">${itemsHtml}</div>
    <div class="x-ticker-group" aria-hidden="true">${itemsHtml}</div>
  `;

  bindPostTriggerElements(track);
}

// ==================== 7. الأقسام، الواجهة الكبرى، المرئيات (9:16)، وبطاقات الأخبار ====================
function getPublishedPostsOnly() {
  return state.posts.filter((p) => !p.status || p.status === "published");
}

function renderCategoriesNavigation() {
  const visibleCats = [...state.compasses]
    .filter((c) => c.visible !== false)
    .sort((a, b) => (a.order || 99) - (b.order || 99));

  const navEl = document.getElementById("public-categories-nav");
  const sideList = document.getElementById("sidebar-categories-list");
  const footLinks = document.getElementById("footer-categories-links");

  if (navEl) {
    navEl.innerHTML = [
      `<button type="button" class="x-cat-tab ${
        state.activeCategory === "all" && !state.activeSpecialFilter ? "active" : ""
      }" data-cat="all">الرئيسية</button>`,
      ...visibleCats.map((c) => {
        const clean = cleanCategoryName(c.name);
        const isActive =
          state.activeCategory === clean && !state.activeSpecialFilter;
        return `<button type="button" class="x-cat-tab ${
          isActive ? "active" : ""
        }" data-cat="${escapeHtml(clean)}">${escapeHtml(clean)}</button>`;
      })
    ].join("");

    navEl.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectPublicCategory(btn.getAttribute("data-cat") || "all", true);
      });
    });
  }

  if (sideList) {
    sideList.innerHTML = [
      `<button type="button" class="x-sidebar-link" data-side-cat="all">
        <span class="material-symbols-rounded" translate="no">home</span>
        <span>الرئيسية وكافة الأخبار</span>
      </button>`,
      ...visibleCats.map((c) => {
        const clean = cleanCategoryName(c.name);
        return `
          <button type="button" class="x-sidebar-link" data-side-cat="${escapeHtml(clean)}">
            <span class="material-symbols-rounded" translate="no">tag</span>
            <span>${escapeHtml(clean)}</span>
          </button>
        `;
      })
    ].join("");

    sideList.querySelectorAll("[data-side-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof closePublicSidebar === "function") closePublicSidebar();
        selectPublicCategory(btn.getAttribute("data-side-cat") || "all", true);
      });
    });
  }

  if (footLinks) {
    footLinks.innerHTML = visibleCats
      .slice(0, 7)
      .map((c) => {
        const clean = cleanCategoryName(c.name);
        return `<button type="button" class="x-footer-link" data-foot-cat="${escapeHtml(
          clean
        )}">${escapeHtml(clean)}</button>`;
      })
      .join("");

    footLinks.querySelectorAll("[data-foot-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectPublicCategory(btn.getAttribute("data-foot-cat") || "all", true);
      });
    });
  }

  renderSubcategoriesBar();
}

function renderSubcategoriesBar() {
  const wrap = document.getElementById("public-subcategories-wrap");
  const nav = document.getElementById("public-subcategories-nav");
  if (!wrap || !nav) return;

  if (state.activeCategory === "all" || state.activeSpecialFilter) {
    wrap.classList.add("hidden");
    return;
  }

  const matchedCat = state.compasses.find(
    (c) => cleanCategoryName(c.name) === state.activeCategory
  );
  const subs = Array.isArray(matchedCat?.subcategories) ? matchedCat.subcategories : [];

  if (!subs.length) {
    wrap.classList.add("hidden");
    return;
  }

  wrap.classList.remove("hidden");
  nav.innerHTML = [
    `<button type="button" class="x-subcat-chip ${
      !state.activeSubcategory ? "active" : ""
    }" data-subcat="">كل أخبار ${escapeHtml(state.activeCategory)}</button>`,
    ...subs.map(
      (sub) => `
      <button type="button" class="x-subcat-chip ${
        state.activeSubcategory === sub ? "active" : ""
      }" data-subcat="${escapeHtml(sub)}">${escapeHtml(sub)}</button>
    `
    )
  ].join("");

  nav.querySelectorAll("[data-subcat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeSubcategory = btn.getAttribute("data-subcat") || "";
      renderSubcategoriesBar();
      renderPublicFeedAndShowcase();
    });
  });
}

function selectPublicCategory(catName, pushHistory = true) {
  state.activeCategory = catName || "all";
  state.activeSubcategory = "";
  state.activeSpecialFilter = "";
  state.activeTag = "";
  state.activeAuthorKey = "";

  if (typeof exitAllSubViewsToHome === "function") {
    exitAllSubViewsToHome(false);
  }

  if (pushHistory) {
    if (state.activeCategory === "all") {
      window.history.pushState({}, "", window.location.pathname);
      applyDynamicIdentityAndMeta({ type: "home" });
    } else {
      const matched = state.compasses.find(
        (c) => cleanCategoryName(c.name) === state.activeCategory
      );
      const compassSlug = matched?.id || state.activeCategory;
      window.history.pushState(
        { compass: compassSlug },
        "",
        `?compass=${encodeURIComponent(compassSlug)}`
      );
      applyDynamicIdentityAndMeta({
        type: "collection",
        title: state.activeCategory
      });
    }
  }

  renderCategoriesNavigation();
  renderPublicFeedAndShowcase();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function activateSpecialCompassFilter(filterType, pushHistory = true) {
  state.activeCategory = "all";
  state.activeSubcategory = "";
  state.activeSpecialFilter = filterType; // "pulse-only" | "shorts-only"
  state.activeTag = "";
  state.activeAuthorKey = "";

  if (typeof exitAllSubViewsToHome === "function") {
    exitAllSubViewsToHome(false);
  }

  if (pushHistory) {
    window.history.pushState(
      { compass: filterType },
      "",
      `?compass=${encodeURIComponent(filterType)}`
    );
  }

  const filterTitle =
    filterType === "shorts-only"
      ? "الفيديوهات القصيرة والمرئيات"
      : "موجز الأخبار السريعة (النبض)";
  applyDynamicIdentityAndMeta({ type: "collection", title: filterTitle });

  renderCategoriesNavigation();
  renderPublicFeedAndShowcase();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSponsoredAdsSlots() {
  const activeAds = state.ads.filter(
    (ad) => ad.active !== false && ad.status !== "paused" && isSafeHttpUrl(ad.targetUrl)
  );
  const topSlot = document.getElementById("top-sponsored-ad-slot");
  const bottomSlot = document.getElementById("bottom-sponsored-ad-slot");

  if (!activeAds.length) {
    topSlot?.classList.add("hidden");
    bottomSlot?.classList.add("hidden");
    return;
  }

  const buildAdHtml = (ad) => `
    <a href="${escapeHtml(ad.targetUrl)}" target="_blank" rel="noopener noreferrer sponsored" class="x-ad-card" data-ad-click="${escapeHtml(
      ad.id
    )}">
      <div>
        <small style="display:inline-block;font-size:0.67rem;font-weight:900;color:var(--brand-primary);background:var(--brand-soft);padding:1px 8px;border-radius:99px;margin-bottom:4px;">
          مادة إعلانية ${ad.sponsorName ? `• ${escapeHtml(ad.sponsorName)}` : ""}
        </small>
        <strong style="display:block;font-size:0.93rem;font-weight:900;color:var(--x-text);">${escapeHtml(
          ad.title
        )}</strong>
      </div>
      ${
        isSafeHttpUrl(ad.imageUrl)
          ? `<img src="${escapeHtml(ad.imageUrl)}" alt="${escapeHtml(ad.title)}" loading="lazy">`
          : ""
      }
    </a>
  `;

  if (topSlot && activeAds[0]) {
    topSlot.classList.remove("hidden");
    topSlot.innerHTML = buildAdHtml(activeAds[0]);
    if (markItemViewedInRam(`ad_view_${activeAds[0].id}`)) {
      updateDoc(doc(db, "ads", activeAds[0].id), { views: increment(1) }).catch(() => {});
    }
  }

  if (bottomSlot) {
    const secondAd = activeAds[1] || activeAds[0];
    bottomSlot.classList.remove("hidden");
    bottomSlot.innerHTML = buildAdHtml(secondAd);
    if (markItemViewedInRam(`ad_view_${secondAd.id}`)) {
      updateDoc(doc(db, "ads", secondAd.id), { views: increment(1) }).catch(() => {});
    }
  }

  document.querySelectorAll("[data-ad-click]").forEach((link) => {
    link.onclick = () => {
      const adId = link.getAttribute("data-ad-click");
      if (adId && markItemViewedInRam(`ad_click_${adId}`)) {
        updateDoc(doc(db, "ads", adId), { clicks: increment(1) }).catch(() => {});
      }
    };
  });
}

function getFeaturedDeckPool(allPublished) {
  const markedFeatured = allPublished.filter((p) => Boolean(p.isFeatured));
  const others = allPublished.filter((p) => !p.isFeatured);
  return [...markedFeatured, ...others].slice(0, 12);
}

function renderAsymmetricGlassShowcase(allPublished, animateSwitch = false) {
  const stage = document.getElementById("featured-mosaic-stage");
  const controls = document.getElementById("featured-deck-controls");
  const dotsWrap = document.getElementById("deck-dots-wrap");
  const pulseList = document.getElementById("quick-pulse-list");
  if (!stage || !pulseList || !allPublished.length) return;

  const deckPool = getFeaturedDeckPool(allPublished);
  const totalSlides = Math.max(1, Math.ceil(deckPool.length / DECK_CARDS_PER_SLIDE));
  state.deckTotalSlides = totalSlides;

  if (state.deckSlideIndex >= totalSlides) state.deckSlideIndex = 0;
  if (state.deckSlideIndex < 0) state.deckSlideIndex = totalSlides - 1;

  const startIdx = state.deckSlideIndex * DECK_CARDS_PER_SLIDE;
  const currentCards = deckPool.slice(startIdx, startIdx + DECK_CARDS_PER_SLIDE);

  if (controls && dotsWrap) {
    controls.classList.toggle("hidden", totalSlides <= 1);
    dotsWrap.innerHTML = Array.from({ length: totalSlides })
      .map(
        (_, idx) =>
          `<span class="x-deck-dot ${
            idx === state.deckSlideIndex ? "active" : ""
          }" data-deck-dot="${idx}" style="cursor:pointer;"></span>`
      )
      .join("");

    dotsWrap.querySelectorAll("[data-deck-dot]").forEach((dot) => {
      dot.addEventListener("click", () => {
        state.deckSlideIndex = Number(dot.getAttribute("data-deck-dot") || 0);
        renderAsymmetricGlassShowcase(getPublishedPostsOnly(), true);
        restartDeckAutoTimer();
      });
    });
  }

  if (animateSwitch) {
    stage.classList.remove("is-switching");
    void stage.offsetWidth;
    stage.classList.add("is-switching");
  }

  stage.innerHTML = currentCards
    .map((post, idx) => {
      const cats = extractPostCategoriesList(post);
      const author = resolvePublicAuthor(post);
      const hasVideo = Boolean(post.videoUrl);

      return `
        <article class="x-glass-tile tile-slot-${idx % 4}" data-open-post="${escapeHtml(
          post.id
        )}">
          <div class="x-tile-media">
            <img src="${escapeHtml(resolvePostImage(post))}" alt="${escapeHtml(
              post.title
            )}" loading="eager">
            <span class="x-tile-badge">${escapeHtml(cats[0])}</span>
            ${
              hasVideo
                ? `<span class="media-floating-badge">
                    <span class="material-symbols-rounded" translate="no">play_circle</span>
                    <span>${escapeHtml(
                      post.videoDuration || (isShortVerticalPost(post) ? "فيديو قصير" : "فيديو")
                    )}</span>
                  </span>`
                : ""
            }
          </div>
          <div class="x-tile-glass-dock">
            <h3 class="x-tile-title">${escapeHtml(post.title)}</h3>
            <div class="x-tile-meta">
              <span>
                ${escapeHtml(author.name)}
                ${
                  author.verified
                    ? `<span class="material-symbols-rounded x-verified-badge" translate="no">verified</span>`
                    : ""
                }
              </span>
              <span>${formatArabicDate(post)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  bindPostTriggerElements(stage);

  // تغذية عمود موجز النبض السريع
  const quickPosts = allPublished.filter((p) => Boolean(p.isQuickNews));
  const pulseItems = (quickPosts.length ? quickPosts : allPublished).slice(0, 8);

  pulseList.innerHTML = pulseItems
    .map(
      (p) => `
      <div class="x-pulse-node" data-open-post="${escapeHtml(p.id)}">
        <small>${formatArabicDate(p)}</small>
        <strong>${escapeHtml(p.title)}</strong>
      </div>
    `
    )
    .join("");

  bindPostTriggerElements(pulseList);
}

function stepFeaturedDeckSlide(direction = 1) {
  const allPublished = getPublishedPostsOnly();
  if (!allPublished.length || state.deckTotalSlides <= 1) return;
  state.deckSlideIndex =
    (state.deckSlideIndex + direction + state.deckTotalSlides) %
    state.deckTotalSlides;
  renderAsymmetricGlassShowcase(allPublished, true);
}

function restartDeckAutoTimer() {
  clearInterval(state.deckAutoTimer);
  state.deckAutoTimer = setInterval(() => {
    if (!state.currentReadingPostId && state.deckTotalSlides > 1) {
      stepFeaturedDeckSlide(1);
    }
  }, 8500);
}

// عرض قسم الفيديوهات القصيرة والمرئيات (Shorts / Reels 9:16)
function renderShortsReelsSection(allPublished, isHomeDefault) {
  const section = document.getElementById("shorts-reels-section");
  const rail = document.getElementById("shorts-articles-grid");
  if (!section || !rail) return;

  if (!isHomeDefault) {
    section.classList.add("hidden");
    return;
  }

  const shortsPosts = allPublished.filter(
    (p) => isShortVerticalPost(p) || Boolean(p.videoUrl)
  );

  if (!shortsPosts.length) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  rail.innerHTML = shortsPosts
    .slice(0, 6)
    .map((p) => {
      const durationLabel =
        p.videoDuration || (isShortVerticalPost(p) ? "فيديو قصير" : "مرئيات");
      return `
        <article class="x-short-card" data-open-post="${escapeHtml(p.id)}">
          <img src="${escapeHtml(resolvePostImage(p))}" alt="${escapeHtml(
            p.title
          )}" loading="lazy">
          <div class="x-short-overlay">
            <div class="x-short-top">
              <span class="x-short-play">
                <span class="material-symbols-rounded" translate="no">play_arrow</span>
              </span>
              <span class="x-short-duration">${escapeHtml(durationLabel)}</span>
            </div>
            <h3 class="x-short-title">${escapeHtml(p.title)}</h3>
          </div>
        </article>
      `;
    })
    .join("");

  bindPostTriggerElements(rail);
}

// بناء بطاقة الخبر القياسية (مع دعم تصنيفين + شارة +N + شارة الفيديو العائمة)
function buildNewsCardHtml(post) {
  const cats = extractPostCategoriesList(post);
  const visibleCats = cats.slice(0, 2);
  const extraCount = Math.max(0, cats.length - 2);
  const author = resolvePublicAuthor(post);
  const excerpt = post.summary || stripHtml(post.content).slice(0, 138);
  const hasVideo = Boolean(post.videoUrl);
  const videoLabel =
    post.videoDuration || (isShortVerticalPost(post) ? "فيديو قصير" : "فيديو");

  return `
    <article class="x-news-card" data-open-post="${escapeHtml(post.id)}">
      <div class="x-card-thumb">
        <img src="${escapeHtml(resolvePostImage(post))}" alt="${escapeHtml(
          post.title
        )}" loading="lazy">
        ${
          hasVideo
            ? `<span class="media-floating-badge">
                <span class="material-symbols-rounded" translate="no">play_circle</span>
                <span>${escapeHtml(videoLabel)}</span>
              </span>`
            : ""
        }
      </div>
      <div class="x-card-body">
        <div>
          <div class="x-card-taxonomies">
            ${visibleCats
              .map((c) => `<span class="x-cat-pill">${escapeHtml(c)}</span>`)
              .join("")}
            ${
              extraCount > 0
                ? `<span class="x-cat-extra-pill" title="${escapeHtml(
                    cats.slice(2).join("، ")
                  )}">+${extraCount}</span>`
                : ""
            }
            ${
              post.subcategory
                ? `<span class="x-subcat-pill">${escapeHtml(post.subcategory)}</span>`
                : ""
            }
          </div>
          <h3 class="x-card-title">${escapeHtml(post.title)}</h3>
          <p class="x-card-summary">${escapeHtml(excerpt)}</p>
        </div>
        <div class="x-card-foot">
          <span>
            ${escapeHtml(author.name)}
            ${
              author.verified
                ? `<span class="material-symbols-rounded x-verified-badge" translate="no">verified</span>`
                : ""
            }
          </span>
          <span>${formatArabicDate(post)}</span>
        </div>
      </div>
    </article>
  `;
}

function bindPostTriggerElements(containerEl) {
  if (!containerEl) return;
  containerEl.querySelectorAll("[data-open-post]").forEach((el) => {
    el.addEventListener("click", () => {
      const pid = el.getAttribute("data-open-post");
      if (pid && typeof openArticleReader === "function") {
        openArticleReader(pid, true);
      }
    });
  });
}

/* === نهاية الجزء الأول من app.js للموقع العام — يُلصق الجزء الثاني تحته مباشرة === */
/* ==========================================================================
   حُجرية بريس (Hujariya Press) — المحرك البرمجي الشامل للموقع العام
   [الجزء الثاني من 2 — يُلصق مباشرة أسفل الجزء الأول]:
   - الجلب الذكي التدريجي (20 مقالاً + startAfter) + جلب المقال القديم بالرابط المباشر
   - زاوية الكُتّاب وأقلام المنصة + صفحة أرشيف الكاتب المستقلة (#view-author)
   - قارئ المقال الاحترافي: شريط تقدم القراءة + وقت القراءة + تحجيم الخط (A+ / A / A-)
   - عارض وتكبير الصور الاحترافي (Image Lightbox) المربوط بعد التطهير السيبراني
   - نظام الروابط العميقة الشامل (?post= , ?compass= , ?author= , ?page=)
   ========================================================================== */

// ==================== 8. زاوية الكُتّاب وأقلام المنصة + صفحة أرشيف الكاتب ====================
function getActiveWritersWithCounts() {
  const allPublished = getPublishedPostsOnly();
  const writerMap = new Map();

  // أولاً: إضافة الكادر المعتمد من جدول الكادر العام المطهر
  state.publicStaff.forEach((member) => {
    const key = member.id || member.name;
    if (!key) return;
    writerMap.set(key, {
      id: member.id || "",
      key,
      name: member.name,
      jobTitle: member.jobTitle || "صحفي ومحرر في حُجرية بريس",
      bio:
        member.bio ||
        `كاتب ومحرر صحفي في منصة ${state.settings.siteName || "حُجرية بريس"}.`,
      avatar:
        member.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          member.name
        )}&background=b80d38&color=fff`,
      verified: Boolean(member.verified),
      articlesCount: 0
    });
  });

  // ثانياً: حساب عدد المقالات المنشورة لكل كاتب وإضافة أي كاتب له مقالات منشورة
  allPublished.forEach((post) => {
    const resolved = resolvePublicAuthor(post);
    const matchEntry =
      (resolved.id && writerMap.get(resolved.id)) ||
      Array.from(writerMap.values()).find((w) => w.name === resolved.name);

    if (matchEntry) {
      matchEntry.articlesCount += 1;
    } else if (resolved.name) {
      const fallbackKey = resolved.id || resolved.name;
      writerMap.set(fallbackKey, {
        ...resolved,
        key: fallbackKey,
        articlesCount: 1
      });
    }
  });

  return Array.from(writerMap.values()).sort(
    (a, b) => b.articlesCount - a.articlesCount
  );
}

function renderWritersStripAndSidebar() {
  const writers = getActiveWritersWithCounts();
  const homeSection = document.getElementById("writers-strip-section");
  const homeGrid = document.getElementById("writers-strip-grid");
  const sideBlock = document.getElementById("sidebar-writers-block");
  const sideList = document.getElementById("sidebar-writers-list");

  const isHomeDefault =
    state.activeCategory === "all" &&
    !state.activeSubcategory &&
    !state.activeSpecialFilter &&
    !state.activeTag &&
    !state.activeAuthorKey &&
    !state.searchQuery;

  if (!writers.length) {
    homeSection?.classList.add("hidden");
    sideBlock?.classList.add("hidden");
    return;
  }

  // 1. زاوية الكُتّاب في الصفحة الرئيسية
  if (homeSection && homeGrid) {
    homeSection.classList.toggle("hidden", !isHomeDefault);
    homeGrid.innerHTML = writers
      .slice(0, 8)
      .map(
        (w) => `
        <article class="x-writer-card" data-open-author="${escapeHtml(w.key)}">
          <img src="${escapeHtml(w.avatar)}" alt="${escapeHtml(
          w.name
        )}" class="x-writer-avatar" loading="lazy">
          <div class="x-writer-info">
            <h3 class="x-writer-name">
              <span>${escapeHtml(w.name)}</span>
              ${
                w.verified
                  ? `<span class="material-symbols-rounded x-verified-badge" translate="no">verified</span>`
                  : ""
              }
            </h3>
            <span class="x-writer-role">${escapeHtml(w.jobTitle)}</span>
            <span class="x-writer-count">${
              w.articlesCount > 0 ? `${w.articlesCount} مادة منشورة` : "كاتب معتمد"
            }</span>
          </div>
        </article>
      `
      )
      .join("");

    homeGrid.querySelectorAll("[data-open-author]").forEach((card) => {
      card.addEventListener("click", () => {
        const key = card.getAttribute("data-open-author");
        if (key) openAuthorArchiveView(key, true);
      });
    });
  }

  // 2. قائمة الكُتّاب في القائمة الجانبية
  if (sideBlock && sideList) {
    sideBlock.classList.remove("hidden");
    sideList.innerHTML = writers
      .slice(0, 10)
      .map(
        (w) => `
        <button type="button" class="x-side-writer-item" data-side-author="${escapeHtml(
          w.key
        )}">
          <img src="${escapeHtml(w.avatar)}" alt="${escapeHtml(w.name)}" loading="lazy">
          <div style="min-width:0;">
            <div style="display:flex;align-items:center;gap:4px;font-size:0.82rem;font-weight:900;color:var(--x-text);">
              <span>${escapeHtml(w.name)}</span>
              ${
                w.verified
                  ? `<span class="material-symbols-rounded x-verified-badge" style="font-size:14px;" translate="no">verified</span>`
                  : ""
              }
            </div>
            <small style="display:block;font-size:0.7rem;color:var(--x-muted);font-weight:700;">
              ${escapeHtml(w.jobTitle)}
            </small>
          </div>
        </button>
      `
      )
      .join("");

    sideList.querySelectorAll("[data-side-author]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closePublicSidebar();
        const key = btn.getAttribute("data-side-author");
        if (key) openAuthorArchiveView(key, true);
      });
    });
  }
}

// فتح صفحة أرشيف الكاتب المستقلة (#view-author)
function openAuthorArchiveView(authorKey, updateHistory = true) {
  const cleanKey = String(authorKey || "").trim();
  if (!cleanKey) return;

  const writers = getActiveWritersWithCounts();
  let targetAuthor = writers.find(
    (w) => w.key === cleanKey || w.id === cleanKey || w.name === cleanKey
  );

  if (!targetAuthor) {
    const samplePost = getPublishedPostsOnly().find(
      (p) => p.authorId === cleanKey || p.author === cleanKey
    );
    targetAuthor = resolvePublicAuthor(
      samplePost || { author: cleanKey, authorId: cleanKey }
    );
  }

  state.currentReadingPostId = null;
  state.activeAuthorKey = cleanKey;

  document.getElementById("home-feed-view")?.classList.add("hidden");
  document.getElementById("article-reader-view")?.classList.add("hidden");
  document.getElementById("reading-progress-bar")?.classList.add("hidden");
  document.getElementById("view-author")?.classList.remove("hidden");

  if (updateHistory) {
    window.history.pushState(
      { author: cleanKey },
      "",
      `?author=${encodeURIComponent(cleanKey)}`
    );
  }

  applyDynamicIdentityAndMeta({
    type: "collection",
    title: `مقالات الكاتب ${targetAuthor.name}`
  });

  const authorPosts = getPublishedPostsOnly().filter(
    (p) =>
      (targetAuthor.id && p.authorId === targetAuthor.id) ||
      String(p.author || "").trim() === String(targetAuthor.name || "").trim() ||
      p.author === cleanKey
  );

  const heroEl = document.getElementById("author-archive-hero");
  if (heroEl) {
    heroEl.innerHTML = `
      <img src="${escapeHtml(targetAuthor.avatar)}" alt="${escapeHtml(
      targetAuthor.name
    )}" class="x-author-hero-avatar">
      <div style="flex:1;min-width:220px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <h1 style="font-size:1.35rem;font-weight:900;color:var(--x-text);">${escapeHtml(
            targetAuthor.name
          )}</h1>
          ${
            targetAuthor.verified
              ? `<span class="material-symbols-rounded x-verified-badge" style="font-size:20px;" translate="no">verified</span>`
              : ""
          }
        </div>
        <span style="display:inline-block;font-size:0.82rem;font-weight:900;color:var(--brand-primary);margin:4px 0 8px;">
          ${escapeHtml(targetAuthor.jobTitle)}
        </span>
        <p style="font-size:0.9rem;color:var(--x-text-sec);line-height:1.75;font-weight:700;">
          ${escapeHtml(targetAuthor.bio)}
        </p>
      </div>
    `;
  }

  const headingEl = document.getElementById("author-archive-heading");
  if (headingEl) {
    headingEl.textContent = `أرشيف مقالات وتقارير: ${targetAuthor.name}`;
  }

  const countEl = document.getElementById("author-archive-count");
  if (countEl) {
    countEl.textContent = `${authorPosts.length} مادة`;
  }

  const gridEl = document.getElementById("author-archive-grid");
  if (gridEl) {
    if (!authorPosts.length) {
      gridEl.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:36px 16px;background:var(--x-surface);border-radius:16px;border:1px solid var(--x-border);color:var(--x-muted);font-weight:800;">
          لا توجد مقالات منشورة ضمن الدفعة الحالية لهذا الكاتب.
        </div>
      `;
    } else {
      gridEl.innerHTML = authorPosts.map((p) => buildNewsCardHtml(p)).join("");
      bindPostTriggerElements(gridEl);
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==================== 9. فلترة التدفق الإخباري + البحث الفوري مع العداد ====================
function getFilteredFeedPosts() {
  let list = [...getPublishedPostsOnly()];

  if (state.activeSpecialFilter === "pulse-only") {
    const quick = list.filter((p) => Boolean(p.isQuickNews));
    list = quick.length ? quick : list;
  } else if (state.activeSpecialFilter === "shorts-only") {
    list = list.filter((p) => isShortVerticalPost(p) || Boolean(p.videoUrl));
  }

  if (state.activeCategory !== "all") {
    list = list.filter((p) => {
      const cats = extractPostCategoriesList(p);
      return cats.includes(state.activeCategory);
    });
  }

  if (state.activeSubcategory) {
    list = list.filter((p) => p.subcategory === state.activeSubcategory);
  }

  if (state.activeTag) {
    list = list.filter(
      (p) =>
        Array.isArray(p.tags) &&
        p.tags.some(
          (t) =>
            String(t).replace(/^#+/, "").toLowerCase() ===
            state.activeTag.toLowerCase()
        )
    );
  }

  if (state.searchQuery) {
    const terms = state.searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    list = list.filter((p) => {
      const cats = extractPostCategoriesList(p).join(" ");
      const hay = `${p.title || ""} ${p.summary || ""} ${p.author || ""} ${cats} ${
        p.subcategory || ""
      } ${Array.isArray(p.tags) ? p.tags.join(" ") : ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  return list;
}

function renderPublicFeedAndShowcase() {
  renderBreakingNewsBar();
  renderSponsoredAdsSlots();

  const allPublished = getPublishedPostsOnly();
  const isHomeDefault =
    state.activeCategory === "all" &&
    !state.activeSubcategory &&
    !state.activeSpecialFilter &&
    !state.activeTag &&
    !state.activeAuthorKey &&
    !state.searchQuery;

  const heroSection = document.getElementById("hero-bento-section");
  const filterBanner = document.getElementById("active-filter-banner");
  const filterText = document.getElementById("active-filter-text");

  if (!isHomeDefault) {
    heroSection?.classList.add("hidden");
    filterBanner?.classList.remove("hidden");

    const parts = [];
    if (state.activeSpecialFilter === "pulse-only") {
      parts.push("موجز الأخبار السريعة (النبض)");
    } else if (state.activeSpecialFilter === "shorts-only") {
      parts.push("الفيديوهات القصيرة والمرئيات");
    }
    if (state.activeCategory !== "all") parts.push(`القسم: ${state.activeCategory}`);
    if (state.activeSubcategory) parts.push(`الفرعي: ${state.activeSubcategory}`);
    if (state.activeTag) parts.push(`الوسم: #${state.activeTag}`);
    if (state.searchQuery) parts.push(`البحث: "${state.searchQuery}"`);
    if (filterText) filterText.textContent = parts.join(" • ");
  } else {
    filterBanner?.classList.add("hidden");
    heroSection?.classList.toggle("hidden", allPublished.length === 0);
    renderAsymmetricGlassShowcase(allPublished, false);
  }

  renderShortsReelsSection(allPublished, isHomeDefault);
  renderWritersStripAndSidebar();

  const filtered = getFilteredFeedPosts();

  // تحديث عداد نتائج البحث الفوري
  const searchCounter = document.getElementById("search-results-counter");
  if (searchCounter) {
    if (state.searchQuery) {
      searchCounter.textContent = `${filtered.length} نتيجة`;
      searchCounter.classList.remove("hidden");
    } else {
      searchCounter.classList.add("hidden");
    }
  }

  // تحديث عنوان القسم وعداد المواد الصحفية
  const headingEl = document.getElementById("feed-section-heading");
  if (headingEl) {
    if (state.activeSpecialFilter === "pulse-only") {
      headingEl.textContent = "موجز الأخبار السريعة (النبض)";
    } else if (state.activeSpecialFilter === "shorts-only") {
      headingEl.textContent = "الفيديوهات القصيرة والمرئيات";
    } else if (state.activeCategory !== "all") {
      headingEl.textContent = state.activeCategory;
    } else {
      headingEl.textContent = "أحدث الأخبار والتقارير";
    }
  }

  const countBadge = document.getElementById("feed-articles-count");
  if (countBadge) {
    countBadge.textContent = `${filtered.length} مادة`;
  }

  const gridEl = document.getElementById("public-articles-grid");
  const fallbackWrap = document.getElementById("load-more-fallback-wrap");
  if (!gridEl) return;

  if (!filtered.length) {
    gridEl.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:38px 16px;background:var(--x-surface);border-radius:16px;border:1px solid var(--x-border);color:var(--x-muted);font-weight:800;">
        لا توجد مواد صحفية مطابقة حالياً.
      </div>
    `;
    fallbackWrap?.classList.add("hidden");
    return;
  }

  gridEl.innerHTML = filtered.map((post) => buildNewsCardHtml(post)).join("");
  bindPostTriggerElements(gridEl);

  fallbackWrap?.classList.toggle(
    "hidden",
    !state.hasMorePosts || state.isFetchingBatch
  );
}

// ==================== 10. عارض وتكبير الصور الاحترافي (Image Lightbox) ====================
function openImageLightbox(srcUrl, captionText = "") {
  if (!isSafeHttpUrl(srcUrl)) return;
  const overlay = document.getElementById("inline-image-lightbox");
  const imgEl = document.getElementById("lightbox-main-img");
  const capEl = document.getElementById("lightbox-caption");
  if (!overlay || !imgEl) return;

  imgEl.src = srcUrl;
  imgEl.alt = captionText || "";

  if (capEl) {
    const cleanCap = String(captionText || "").trim();
    capEl.textContent = cleanCap;
    capEl.classList.toggle("hidden", !cleanCap);
  }

  overlay.classList.remove("hidden");
}

function closeImageLightbox() {
  const overlay = document.getElementById("inline-image-lightbox");
  const imgEl = document.getElementById("lightbox-main-img");
  if (!overlay) return;
  overlay.classList.add("hidden");
  if (imgEl) imgEl.removeAttribute("src");
}

// ربط النقر لتكبير الصور بعد تمرير المقال عبر دالة التطهير السيبراني
function bindArticleImagesToLightbox() {
  const heroImg = document.getElementById("reader-hero-image");
  if (heroImg) {
    heroImg.onclick = () => {
      const src = heroImg.getAttribute("src");
      const alt = heroImg.getAttribute("alt") || "";
      if (src) openImageLightbox(src, alt);
    };
  }

  const contentEl = document.getElementById("reader-article-content");
  if (!contentEl) return;

  contentEl.querySelectorAll("img").forEach((img) => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      const src = img.getAttribute("src");
      const fig = img.closest("figure");
      const figCap = fig?.querySelector("figcaption")?.textContent || "";
      const caption = figCap || img.getAttribute("alt") || "";
      if (src) openImageLightbox(src, caption);
    });
  });
}

// ==================== 11. قارئ الخبر الاحترافي + جلب الخبر القديم بالرابط المباشر ====================
function buildSafeEmbeddedVideoHtml(videoUrl = "", videoType = "standard") {
  const clean = String(videoUrl || "").trim();
  if (!isSafeHttpUrl(clean)) return { html: "", isVertical: false };

  const isVertical =
    videoType === "short_vertical" || clean.toLowerCase().includes("/shorts/");

  const ytMatch = clean.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = encodeURIComponent(ytMatch[1]);
    return {
      isVertical,
      html: `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    };
  }

  return {
    isVertical,
    html: `<video src="${escapeHtml(clean)}" controls preload="metadata" playsinline></video>`
  };
}

// جلب خبر محدد من Firestore فوراً إذا دخل الزائر عبر رابط مباشر لخبر قديم غير محمل في أول 20 مقالاً
async function fetchSinglePostByIdIfNeeded(postId) {
  const cleanId = String(postId || "").trim();
  if (!cleanId) return null;

  const existing = getPublishedPostsOnly().find((p) => p.id === cleanId);
  if (existing) return existing;

  try {
    const docSnap = await getDoc(doc(db, "posts", cleanId));
    if (!docSnap.exists()) return null;
    const rawData = docSnap.data();
    if (rawData.status && rawData.status !== "published") return null;

    const cleanPost = stripSensitivePostData(rawData, docSnap.id);
    const alreadyInState = state.posts.some((p) => p.id === cleanPost.id);
    if (!alreadyInState) {
      state.posts.push(cleanPost);
      state.posts.sort((a, b) => getTimestampMs(b) - getTimestampMs(a));
    }
    return cleanPost;
  } catch (_) {
    return null;
  }
}

async function openArticleReader(postId, updateHistory = true) {
  let post = getPublishedPostsOnly().find((p) => p.id === postId);
  if (!post) {
    post = await fetchSinglePostByIdIfNeeded(postId);
  }

  if (!post) {
    showToast("عذراً، هذه المادة الصحفية غير متاحة حالياً");
    exitAllSubViewsToHome(true);
    return;
  }

  state.currentReadingPostId = post.id;

  if (updateHistory) {
    const nextUrl = `?post=${encodeURIComponent(post.id)}`;
    window.history.pushState({ postId: post.id }, "", nextUrl);
  }

  applyDynamicIdentityAndMeta({ type: "article", post });

  document.getElementById("home-feed-view")?.classList.add("hidden");
  document.getElementById("view-author")?.classList.add("hidden");
  document.getElementById("article-reader-view")?.classList.remove("hidden");
  document.getElementById("reading-progress-bar")?.classList.remove("hidden");

  // احتساب المشاهدة مرة واحدة فقط في الذاكرة الحية RAM أثناء الجلسة
  if (markItemViewedInRam(`post_view_${post.id}`)) {
    post.views = Number(post.views || 0) + 1;
    updateDoc(doc(db, "posts", post.id), { views: increment(1) }).catch(() => {});
  }

  const cats = extractPostCategoriesList(post);
  const author = resolvePublicAuthor(post);

  // عرض كافة تصنيفات الخبر في القارئ مع إمكانية النقر عليها
  const taxWrap = document.getElementById("reader-categories-wrap");
  if (taxWrap) {
    const catsHtml = cats
      .map(
        (c) =>
          `<button type="button" class="x-cat-pill" data-reader-cat="${escapeHtml(
            c
          )}">${escapeHtml(c)}</button>`
      )
      .join("");
    const subHtml = post.subcategory
      ? `<span class="x-subcat-pill">${escapeHtml(post.subcategory)}</span>`
      : "";
    taxWrap.innerHTML = `${catsHtml}${subHtml}`;

    taxWrap.querySelectorAll("[data-reader-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectPublicCategory(btn.getAttribute("data-reader-cat") || "all", true);
      });
    });
  }

  const titleEl = document.getElementById("reader-article-title");
  if (titleEl) titleEl.textContent = post.title || "";

  const sumEl = document.getElementById("reader-article-summary");
  if (sumEl) {
    sumEl.textContent = post.summary || "";
    sumEl.classList.toggle("hidden", !post.summary);
  }

  const avatarEl = document.getElementById("reader-author-avatar");
  if (avatarEl) {
    avatarEl.src = author.avatar;
    avatarEl.alt = author.name;
  }

  const authNameEl = document.getElementById("reader-author-name");
  if (authNameEl) authNameEl.textContent = author.name;

  document
    .getElementById("reader-author-verified")
    ?.classList.toggle("hidden", !author.verified);

  const dateEl = document.getElementById("reader-publish-date");
  if (dateEl) dateEl.textContent = formatArabicDate(post);

  const viewsEl = document.getElementById("reader-views-count");
  if (viewsEl) {
    viewsEl.textContent = `${Number(post.views || 1).toLocaleString("en-US")} قراءة`;
  }

  const readTimeEl = document.getElementById("reader-read-time");
  if (readTimeEl) {
    readTimeEl.textContent = calculateReadingTimeText(post);
  }

  const authTrigger = document.getElementById("reader-author-trigger");
  if (authTrigger) {
    authTrigger.onclick = () => openAuthorArchiveView(author.key, true);
  }

  // الصورة البارزة للخبر
  const heroFig = document.getElementById("reader-hero-figure");
  const heroImg = document.getElementById("reader-hero-image");
  const resolvedImg = resolvePostImage(post);
  if (heroFig && heroImg) {
    heroImg.src = resolvedImg;
    heroImg.alt = post.title || "";
    heroFig.classList.remove("hidden");
  }

  // مشغل الفيديو المدمج الآمن
  const videoBox = document.getElementById("reader-video-container");
  if (videoBox) {
    const vid = buildSafeEmbeddedVideoHtml(post.videoUrl, post.videoType);
    if (vid.html) {
      videoBox.className = `x-video-frame ${
        vid.isVertical ? "is-vertical" : "is-standard"
      }`;
      videoBox.innerHTML = vid.html;
    } else {
      videoBox.className = "x-video-frame hidden";
      videoBox.innerHTML = "";
    }
  }

  // تطهير محتوى المقال سيبرانياً ثم ربط الصور باللايت بوكس للتكبير
  const contentEl = document.getElementById("reader-article-content");
  if (contentEl) {
    const cleanHtml = sanitizeEditorialHtml(post.content || "");
    contentEl.innerHTML = cleanHtml || `<p>${escapeHtml(post.summary || "")}</p>`;
  }
  bindArticleImagesToLightbox();

  // الوسوم والهاشتاجات الدلالية
  const tagsRow = document.getElementById("reader-tags-row");
  if (tagsRow) {
    const tags = Array.isArray(post.tags) ? post.tags.filter(Boolean) : [];
    if (tags.length) {
      tagsRow.classList.remove("hidden");
      tagsRow.innerHTML = tags
        .map((t) => {
          const cleanT = String(t).replace(/^#+/, "").trim();
          return `<button type="button" class="x-tag-chip" data-filter-tag="${escapeHtml(
            cleanT
          )}">#${escapeHtml(cleanT)}</button>`;
        })
        .join("");

      tagsRow.querySelectorAll("[data-filter-tag]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.activeTag = btn.getAttribute("data-filter-tag") || "";
          exitAllSubViewsToHome(true);
          renderPublicFeedAndShowcase();
        });
      });
    } else {
      tagsRow.classList.add("hidden");
    }
  }

  // بطاقة تعريف الكاتب المدمجة أسفل المقال
  const bioBox = document.getElementById("reader-author-bio-box");
  if (bioBox) {
    bioBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="${escapeHtml(
          author.avatar
        )}" alt="${escapeHtml(
      author.name
    )}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--brand-primary);">
        <div>
          <div style="display:flex;align-items:center;gap:5px;">
            <strong style="font-size:0.95rem;">${escapeHtml(author.name)}</strong>
            ${
              author.verified
                ? `<span class="material-symbols-rounded x-verified-badge" translate="no">verified</span>`
                : ""
            }
          </div>
          <span style="display:block;font-size:0.75rem;color:var(--brand-primary);font-weight:800;">${escapeHtml(
            author.jobTitle
          )}</span>
          <p style="font-size:0.8rem;color:var(--x-muted);font-weight:700;margin-top:2px;">${escapeHtml(
            author.bio
          )}</p>
        </div>
      </div>
      <button type="button" id="footer-open-author-btn" class="x-btn x-btn-glass x-btn-sm">
        <span>جميع مقالات الكاتب</span>
      </button>
    `;

    document.getElementById("footer-open-author-btn")?.addEventListener("click", () => {
      openAuthorArchiveView(author.key, true);
    });
  }

  // أخبار ذات صلة
  const relatedGrid = document.getElementById("reader-related-grid");
  if (relatedGrid) {
    const primaryCat = cats[0];
    const related = getPublishedPostsOnly()
      .filter((p) => p.id !== post.id)
      .sort((a, b) => {
        const aSame = extractPostCategoriesList(a).includes(primaryCat) ? 1 : 0;
        const bSame = extractPostCategoriesList(b).includes(primaryCat) ? 1 : 0;
        return bSame - aSame;
      })
      .slice(0, 3);

    relatedGrid.innerHTML = related.map((r) => buildNewsCardHtml(r)).join("");
    bindPostTriggerElements(relatedGrid);
  }

  updateReadingProgressBar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function exitAllSubViewsToHome(updateHistory = true) {
  state.currentReadingPostId = null;
  document.getElementById("article-reader-view")?.classList.add("hidden");
  document.getElementById("view-author")?.classList.add("hidden");
  document.getElementById("reading-progress-bar")?.classList.add("hidden");
  document.getElementById("home-feed-view")?.classList.remove("hidden");

  const videoBox = document.getElementById("reader-video-container");
  if (videoBox) videoBox.innerHTML = "";

  if (updateHistory && window.location.search) {
    window.history.pushState({}, "", window.location.pathname);
  }
  applyDynamicIdentityAndMeta({ type: "home" });
}

function updateReadingProgressBar() {
  const bar = document.getElementById("reading-progress-bar");
  const readerView = document.getElementById("article-reader-view");
  if (!bar || !readerView || readerView.classList.contains("hidden")) {
    bar?.classList.add("hidden");
    return;
  }

  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight =
    document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
  bar.style.width = `${pct}%`;
}

// التحكم بحجم خط القراءة (A+ / A / A-)
function applyReaderFontSizeScale(scaleMode = "reset") {
  if (scaleMode === "increase") {
    state.readerFontScale = Math.min(1.32, Number((state.readerFontScale + 0.1).toFixed(2)));
  } else if (scaleMode === "decrease") {
    state.readerFontScale = Math.max(0.88, Number((state.readerFontScale - 0.1).toFixed(2)));
  } else {
    state.readerFontScale = 1;
  }

  const baseRem = 1.12 * state.readerFontScale;
  document.documentElement.style.setProperty(
    "--reader-font-size",
    `${baseRem.toFixed(2)}rem`
  );

  document
    .getElementById("font-increase-btn")
    ?.classList.toggle("active", state.readerFontScale > 1);
  document
    .getElementById("font-reset-btn")
    ?.classList.toggle("active", state.readerFontScale === 1);
  document
    .getElementById("font-decrease-btn")
    ?.classList.toggle("active", state.readerFontScale < 1);
}

// دوال المشاركة الموحدة (العنوان + الملخص + الرابط النظيف)
async function shareCurrentArticleNative() {
  const post = state.posts.find((p) => p.id === state.currentReadingPostId);
  if (!post) return;
  const shareUrl = getCleanPostShareUrl(post.id);
  const summaryText = post.summary || stripHtml(post.content).slice(0, 130);

  if (navigator.share) {
    try {
      await navigator.share({
        title: post.title,
        text: `${post.title}\n${summaryText}\n`,
        url: shareUrl
      });
      return;
    } catch (_) {}
  }

  try {
    await navigator.clipboard.writeText(`${post.title}\n${shareUrl}`);
    showToast("تم نسخ عنوان الخبر ورابطه للمشاركة ✓");
  } catch (_) {}
}

function shareCurrentArticleWhatsApp() {
  const post = state.posts.find((p) => p.id === state.currentReadingPostId);
  if (!post) return;
  const shareUrl = getCleanPostShareUrl(post.id);
  const summaryText = post.summary ? `\n${post.summary}\n` : "\n";
  const text = `*${post.title}*${summaryText}\nاقرأ عبر حُجرية بريس:\n${shareUrl}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

async function copyCurrentArticleLink() {
  if (!state.currentReadingPostId) return;
  const shareUrl = getCleanPostShareUrl(state.currentReadingPostId);
  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast("تم نسخ رابط الخبر المباشر ✓");
  } catch (_) {}
}

// ==================== 12. الصفحات المؤسسية ونظام الروابط العميقة الشامل ====================
function openInstitutionalModal(docType, updateHistory = true) {
  const modal = document.getElementById("institutional-modal");
  const titleEl = document.getElementById("inst-modal-title");
  const bodyEl = document.getElementById("inst-modal-body");
  if (!modal || !titleEl || !bodyEl) return;

  const cleanType =
    docType === "about" || docType === "privacy" || docType === "charter"
      ? docType
      : "about";

  if (cleanType === "about") {
    titleEl.textContent = "من نحن";
    bodyEl.innerHTML = sanitizeEditorialHtml(
      state.settings.aboutHtml || DEFAULT_ABOUT_HTML
    );
  } else if (cleanType === "privacy") {
    titleEl.textContent = "سياسة الخصوصية";
    bodyEl.innerHTML = sanitizeEditorialHtml(
      state.settings.privacyHtml || DEFAULT_PRIVACY_HTML
    );
  } else {
    titleEl.textContent = "ميثاق الشرف الصحفي";
    bodyEl.innerHTML = sanitizeEditorialHtml(
      state.settings.charterHtml || DEFAULT_CHARTER_HTML
    );
  }

  if (updateHistory) {
    window.history.pushState(
      { page: cleanType },
      "",
      `?page=${encodeURIComponent(cleanType)}`
    );
  }

  closePublicSidebar();
  modal.classList.remove("hidden");
}

function closeInstitutionalModal(restoreUrl = true) {
  const modal = document.getElementById("institutional-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  if (restoreUrl && window.location.search.includes("page=")) {
    window.history.pushState({}, "", window.location.pathname);
  }
}

function openPublicSidebar() {
  document.getElementById("sidebar-backdrop")?.classList.remove("hidden");
  document.getElementById("public-sidebar")?.classList.remove("hidden");
}

function closePublicSidebar() {
  document.getElementById("sidebar-backdrop")?.classList.add("hidden");
  document.getElementById("public-sidebar")?.classList.add("hidden");
}

// موجه الروابط العميقة الشامل (?post= , ?compass= , ?author= , ?page=)
async function handleDeepLinkRoute() {
  const params = new URLSearchParams(window.location.search);
  const postId = params.get("post");
  const compassParam = params.get("compass");
  const authorParam = params.get("author");
  const pageParam = params.get("page");

  if (postId) {
    closeInstitutionalModal(false);
    await openArticleReader(postId, false);
    return;
  }

  if (authorParam) {
    closeInstitutionalModal(false);
    openAuthorArchiveView(authorParam, false);
    return;
  }

  if (compassParam) {
    closeInstitutionalModal(false);
    if (compassParam === "pulse-only" || compassParam === "shorts-only") {
      activateSpecialCompassFilter(compassParam, false);
      return;
    }

    const matchedCat = state.compasses.find(
      (c) =>
        c.id === compassParam ||
        cleanCategoryName(c.name) === cleanCategoryName(compassParam)
    );
    const resolvedName = matchedCat
      ? cleanCategoryName(matchedCat.name)
      : cleanCategoryName(compassParam);
    selectPublicCategory(resolvedName, false);
    return;
  }

  if (pageParam) {
    openInstitutionalModal(pageParam, false);
    return;
  }

  closeInstitutionalModal(false);
  if (state.currentReadingPostId || state.activeAuthorKey) {
    exitAllSubViewsToHome(false);
  }
}

// ==================== 13. الجلب الذكي التدريجي (20 مقالاً + التمرير اللانهائي الحقيقي) ====================
function mergePostsIntoMemoryState(incomingPosts = []) {
  const postMap = new Map();
  state.posts.forEach((p) => {
    if (p?.id) postMap.set(p.id, p);
  });
  incomingPosts.forEach((p) => {
    if (p?.id) postMap.set(p.id, p);
  });

  state.posts = Array.from(postMap.values()).sort(
    (a, b) => getTimestampMs(b) - getTimestampMs(a)
  );
}

async function fetchNextPostsBatchFromFirestore() {
  if (
    state.isFetchingBatch ||
    !state.hasMorePosts ||
    !state.lastVisiblePostDoc ||
    state.currentReadingPostId ||
    state.activeAuthorKey
  ) {
    return;
  }

  state.isFetchingBatch = true;
  const spinnerEl = document.getElementById("infinite-scroll-spinner");
  const fallbackWrap = document.getElementById("load-more-fallback-wrap");
  spinnerEl?.classList.remove("hidden");
  fallbackWrap?.classList.add("hidden");

  try {
    const nextQuery = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc"),
      startAfter(state.lastVisiblePostDoc),
      limit(INITIAL_BATCH_SIZE)
    );
    const snap = await getDocs(nextQuery);

    if (snap.empty) {
      state.hasMorePosts = false;
    } else {
      state.lastVisiblePostDoc = snap.docs[snap.docs.length - 1];
      state.hasMorePosts = snap.docs.length >= INITIAL_BATCH_SIZE;
      const fetchedPosts = snap.docs.map((d) =>
        stripSensitivePostData(d.data(), d.id)
      );
      mergePostsIntoMemoryState(fetchedPosts);
    }
  } catch (_) {
    state.hasMorePosts = false;
  } finally {
    state.isFetchingBatch = false;
    spinnerEl?.classList.add("hidden");
    renderPublicFeedAndShowcase();
  }
}

function initInfiniteScrollObserver() {
  const sentinel = document.getElementById("infinite-scroll-sentinel");
  if (!sentinel || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          fetchNextPostsBatchFromFirestore();
        }
      });
    },
    { rootMargin: "320px 0px" }
  );

  observer.observe(sentinel);
}

// ==================== 14. ربط الأحداث التفاعلية والمزامنة الحية الآمنة مع Firestore ====================
function setMobileDockActive(activeId) {
  [
    "dock-home-btn",
    "dock-pulse-btn",
    "dock-shorts-btn",
    "dock-search-btn",
    "dock-menu-btn"
  ].forEach((id) => {
    document.getElementById(id)?.classList.toggle("active", id === activeId);
  });
}

function bindAllPublicEvents() {
  // القائمة الجانبية
  document.getElementById("open-sidebar-btn")?.addEventListener("click", openPublicSidebar);
  document.getElementById("close-sidebar-btn")?.addEventListener("click", closePublicSidebar);
  document.getElementById("sidebar-backdrop")?.addEventListener("click", closePublicSidebar);

  // العودة للرئيسية
  document.getElementById("brand-home-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    setMobileDockActive("dock-home-btn");
    selectPublicCategory("all", true);
  });

  // إغلاق شريط العاجل
  document.getElementById("close-breaking-bar-btn")?.addEventListener("click", () => {
    document.getElementById("breaking-news-bar")?.classList.add("hidden");
  });

  // أزرار الهيدر والقائمة الجانبية للنبض والمرئيات
  document.getElementById("header-pulse-btn")?.addEventListener("click", () => {
    activateSpecialCompassFilter("pulse-only", true);
  });

  document.getElementById("view-all-pulse-btn")?.addEventListener("click", () => {
    activateSpecialCompassFilter("pulse-only", true);
  });

  document.getElementById("header-shorts-btn")?.addEventListener("click", () => {
    activateSpecialCompassFilter("shorts-only", true);
  });

  document.getElementById("view-all-shorts-btn")?.addEventListener("click", () => {
    activateSpecialCompassFilter("shorts-only", true);
  });

  document.querySelectorAll("[data-side-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closePublicSidebar();
      const filterType = btn.getAttribute("data-side-filter");
      if (filterType) activateSpecialCompassFilter(filterType, true);
    });
  });

  // أزرار التقليب السلس للواجهة الكبرى الزجاجية + السحب باللمس
  document.getElementById("deck-prev-btn")?.addEventListener("click", () => {
    stepFeaturedDeckSlide(-1);
    restartDeckAutoTimer();
  });

  document.getElementById("deck-next-btn")?.addEventListener("click", () => {
    stepFeaturedDeckSlide(1);
    restartDeckAutoTimer();
  });

  const mosaicStage = document.getElementById("featured-mosaic-stage");
  let touchStartX = 0;
  mosaicStage?.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches?.[0]?.screenX || 0;
    },
    { passive: true }
  );

  mosaicStage?.addEventListener(
    "touchend",
    (e) => {
      const touchEndX = e.changedTouches?.[0]?.screenX || 0;
      const delta = touchEndX - touchStartX;
      if (Math.abs(delta) > 45) {
        stepFeaturedDeckSlide(delta > 0 ? 1 : -1);
        restartDeckAutoTimer();
      }
    },
    { passive: true }
  );

  // كبسولة البحث الفوري الذكي
  const searchDrawer = document.getElementById("public-search-drawer");
  const searchInput = document.getElementById("public-search-input");
  const clearSearchBtn = document.getElementById("clear-public-search-btn");

  document.getElementById("toggle-search-btn")?.addEventListener("click", () => {
    searchDrawer?.classList.toggle("hidden");
    if (!searchDrawer?.classList.contains("hidden")) {
      searchInput?.focus();
    }
  });

  const runDebouncedSearch = debounce((val) => {
    state.searchQuery = val;
    exitAllSubViewsToHome(false);
    renderPublicFeedAndShowcase();
  }, 160);

  searchInput?.addEventListener("input", (e) => {
    const val = (e.target.value || "").trim();
    clearSearchBtn?.classList.toggle("hidden", !val);
    runDebouncedSearch(val);
  });

  clearSearchBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    state.searchQuery = "";
    renderPublicFeedAndShowcase();
  });

  document.getElementById("reset-active-filter-btn")?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    clearSearchBtn?.classList.add("hidden");
    state.searchQuery = "";
    selectPublicCategory("all", true);
  });

  // زر عرض المزيد الاحتياطي للتمرير اللانهائي
  document.getElementById("load-more-posts-btn")?.addEventListener("click", () => {
    fetchNextPostsBatchFromFirestore();
  });

  // الشريط السفلي الزجاجي العائم للجوال (5 أزرار)
  document.getElementById("dock-home-btn")?.addEventListener("click", () => {
    setMobileDockActive("dock-home-btn");
    selectPublicCategory("all", true);
  });

  document.getElementById("dock-pulse-btn")?.addEventListener("click", () => {
    setMobileDockActive("dock-pulse-btn");
    activateSpecialCompassFilter("pulse-only", true);
  });

  document.getElementById("dock-shorts-btn")?.addEventListener("click", () => {
    setMobileDockActive("dock-shorts-btn");
    activateSpecialCompassFilter("shorts-only", true);
  });

  document.getElementById("dock-search-btn")?.addEventListener("click", () => {
    setMobileDockActive("dock-search-btn");
    searchDrawer?.classList.remove("hidden");
    searchInput?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  document.getElementById("dock-menu-btn")?.addEventListener("click", () => {
    setMobileDockActive("dock-menu-btn");
    openPublicSidebar();
  });

  // أزرار العودة من قارئ الخبر وصفحة أرشيف الكاتب
  document.getElementById("reader-back-home-btn")?.addEventListener("click", () => {
    exitAllSubViewsToHome(true);
  });

  document.getElementById("author-archive-back-btn")?.addEventListener("click", () => {
    state.activeAuthorKey = "";
    exitAllSubViewsToHome(true);
  });

  // أزرار التحكم بحجم خط القراءة (A+ / A / A-)
  document.getElementById("font-increase-btn")?.addEventListener("click", () => {
    applyReaderFontSizeScale("increase");
  });
  document.getElementById("font-reset-btn")?.addEventListener("click", () => {
    applyReaderFontSizeScale("reset");
  });
  document.getElementById("font-decrease-btn")?.addEventListener("click", () => {
    applyReaderFontSizeScale("decrease");
  });

  // أزرار المشاركة العلوية والسفلية
  document
    .getElementById("share-native-btn")
    ?.addEventListener("click", shareCurrentArticleNative);
  document
    .getElementById("share-native-bottom-btn")
    ?.addEventListener("click", shareCurrentArticleNative);

  document
    .getElementById("share-whatsapp-btn")
    ?.addEventListener("click", shareCurrentArticleWhatsApp);
  document
    .getElementById("share-whatsapp-bottom-btn")
    ?.addEventListener("click", shareCurrentArticleWhatsApp);

  document
    .getElementById("share-copy-link-btn")
    ?.addEventListener("click", copyCurrentArticleLink);
  document
    .getElementById("share-copy-bottom-btn")
    ?.addEventListener("click", copyCurrentArticleLink);

  // النوافذ المؤسسية وعارض تكبير الصور (Lightbox)
  document.querySelectorAll("[data-open-doc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openInstitutionalModal(btn.getAttribute("data-open-doc") || "about", true);
    });
  });

  document.getElementById("close-inst-modal-btn")?.addEventListener("click", () => {
    closeInstitutionalModal(true);
  });

  document
    .getElementById("institutional-modal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "institutional-modal") closeInstitutionalModal(true);
    });

  document
    .getElementById("close-lightbox-btn")
    ?.addEventListener("click", closeImageLightbox);

  document
    .getElementById("inline-image-lightbox")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "inline-image-lightbox") closeImageLightbox();
    });

  window.addEventListener("scroll", updateReadingProgressBar, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePublicSidebar();
      closeInstitutionalModal(true);
      closeImageLightbox();
    }
  });

  window.addEventListener("popstate", () => {
    handleDeepLinkRoute();
  });
}

// المزامنة الحية الآمنة مع Firestore (الجلب التدريجي لأول 20 مقالاً فقط في الذاكرة الحية)
function startPublicFirestoreSync() {
  // 1. الإعدادات العامة (مع بتر فوري لكلمات المرور والرموز السرية)
  onSnapshot(doc(db, "settings", "general"), (snap) => {
    if (snap.exists()) {
      const safeSettings = stripSensitiveSettingsData(snap.data());
      state.settings = { ...state.settings, ...safeSettings };
      const activePost = state.posts.find((p) => p.id === state.currentReadingPostId);
      applyDynamicIdentityAndMeta(
        activePost ? { type: "article", post: activePost } : { type: "home" }
      );
    }
  });

  // 2. الأقسام والتصنيفات الفرعية
  onSnapshot(collection(db, "categories"), (snap) => {
    if (!snap.empty) {
      const dbCats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const merged = [...DEFAULT_COMPASSES];
      dbCats.forEach((cat) => {
        const idx = merged.findIndex(
          (m) =>
            m.id === cat.id ||
            cleanCategoryName(m.name) === cleanCategoryName(cat.name)
        );
        if (idx >= 0) merged[idx] = { ...merged[idx], ...cat };
        else merged.push(cat);
      });
      state.compasses = merged;
      renderCategoriesNavigation();
    }
  });

  // 3. الكادر الصحفي العام (تطهير فوري للبيانات السرية في الذاكرة)
  onSnapshot(collection(db, "staff"), (snap) => {
    state.publicStaff = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.accountStatus !== "frozen" && !s.suspended)
      .map((s) => stripSensitiveStaffData(s, s.id));

    renderPublicFeedAndShowcase();
  });

  // 4. الجلب التدريجي الذكي لأحدث 20 مقالاً فقط (بدلاً من سحب قاعدة البيانات كاملة)
  const initialPostsQuery = query(
    collection(db, "posts"),
    orderBy("createdAt", "desc"),
    limit(INITIAL_BATCH_SIZE)
  );

  onSnapshot(
    initialPostsQuery,
    (snap) => {
      if (!state.lastVisiblePostDoc && snap.docs.length > 0) {
        state.lastVisiblePostDoc = snap.docs[snap.docs.length - 1];
        state.hasMorePosts = snap.docs.length >= INITIAL_BATCH_SIZE;
      }

      const topBatch = snap.docs.map((d) =>
        stripSensitivePostData(d.data(), d.id)
      );
      mergePostsIntoMemoryState(topBatch);
      renderPublicFeedAndShowcase();
      handleDeepLinkRoute();
    },
    async () => {
      // مسار احتياطي تلقائي في حال وجود مقالات قديمة بدون حقل createdAt مفهرس
      try {
        const fallbackSnap = await getDocs(
          query(collection(db, "posts"), limit(INITIAL_BATCH_SIZE))
        );
        const fallbackBatch = fallbackSnap.docs.map((d) =>
          stripSensitivePostData(d.data(), d.id)
        );
        mergePostsIntoMemoryState(fallbackBatch);
        renderPublicFeedAndShowcase();
        handleDeepLinkRoute();
      } catch (_) {}
    }
  );

  // 5. الإعلانات الممولة
  onSnapshot(collection(db, "ads"), (snap) => {
    state.ads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderSponsoredAdsSlots();
  });
}

// نقطة الإقلاع الرئيسية للموقع العام
document.addEventListener("DOMContentLoaded", () => {
  applyDynamicIdentityAndMeta({ type: "home" });
  fetchLiveWeatherForCitiesInMemory();
  startMarketsLiveSimulationInMemory();
  renderCategoriesNavigation();
  renderPublicFeedAndShowcase();
  bindAllPublicEvents();
  initInfiniteScrollObserver();
  restartDeckAutoTimer();
  startPublicFirestoreSync();
});
