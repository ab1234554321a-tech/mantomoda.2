// Seed Data for Manto Moda Platform (Secure Hashes via bcrypt)

const DEFAULT_HASHED_PASSWORD = "$2b$10$wJXLH55mz5NJv9Wn8Xf3d.60TV1AaOSMnCLLMinO5fEau5Yn/fe.W"; // Hashed "password123"

export const SEED_USERS = [
  {
    id: "usr-admin-01",
    email: "admin@manto.ir",
    phone: "09121111111",
    fullName: "مدیریت فروشگاه مدا",
    role: "ADMIN",
    isWholesaleVerified: true,
    passwordHash: DEFAULT_HASHED_PASSWORD,
    createdAt: "2026-08-01T10:00:00Z"
  },
  {
    id: "usr-wholesale-01",
    email: "boutique.tehran@manto.ir",
    phone: "09122222222",
    fullName: "خانم سارا راد (بوتیک الیزه)",
    role: "WHOLESALE",
    isWholesaleVerified: true,
    passwordHash: DEFAULT_HASHED_PASSWORD,
    companyName: "بوتیک الیزه ونک",
    economicCode: "41159876231",
    businessAddress: "تهران، میدان ونک، مرکز تجاری آسمان، طبقه اول، پلاک ۴۲",
    createdAt: "2026-08-10T11:30:00Z"
  },
  {
    id: "usr-retail-01",
    email: "neda.alavi@gmail.com",
    phone: "09123333333",
    fullName: "ندا علوی",
    role: "REGULAR",
    isWholesaleVerified: false,
    passwordHash: DEFAULT_HASHED_PASSWORD,
    createdAt: "2026-08-15T14:20:00Z"
  },
  {
    id: "usr-pending-01",
    email: "boutique.shiraz@gmail.com",
    phone: "09174444444",
    fullName: "مریم حسینی (مزون شیراز)",
    role: "REGULAR",
    isWholesaleVerified: false,
    passwordHash: DEFAULT_HASHED_PASSWORD,
    companyName: "مزون شیراز شیک",
    economicCode: "98765432100",
    businessAddress: "شیراز، خیابان عفیف‌آباد، مجتمع سپهر، واحد ۱۲",
    createdAt: "2026-09-01T09:15:00Z"
  }
];

export const SEED_APPLICATIONS = [
  {
    id: "app-001",
    userId: "usr-pending-01",
    userFullName: "مریم حسینی",
    userEmail: "boutique.shiraz@gmail.com",
    userPhone: "09174444444",
    companyName: "مزون شیراز شیک",
    economicCode: "98765432100",
    businessAddress: "شیراز، خیابان عفیف‌آباد، مجتمع سپهر، واحد ۱۲",
    city: "شیراز",
    province: "فارس",
    businessPhone: "07136280000",
    storeType: "BOTH", // PHYSICAL_STORE, ONLINE_SHOP, BOTH
    status: "PENDING", // PENDING, APPROVED, REJECTED
    adminNotes: "",
    createdAt: "2026-09-01T09:30:00Z"
  },
  {
    id: "app-000",
    userId: "usr-wholesale-01",
    userFullName: "سارا راد",
    userEmail: "boutique.tehran@manto.ir",
    userPhone: "09122222222",
    companyName: "بوتیک الیزه ونک",
    economicCode: "41159876231",
    businessAddress: "تهران، میدان ونک، مرکز تجاری آسمان، پلاک ۴۲",
    city: "تهران",
    province: "تهران",
    businessPhone: "02188776655",
    storeType: "PHYSICAL_STORE",
    status: "APPROVED",
    adminNotes: "تایید شده توسط مدیریت پس از استعلام جواز کسب",
    reviewedBy: "usr-admin-01",
    reviewedAt: "2026-08-11T12:00:00Z",
    createdAt: "2026-08-10T12:00:00Z"
  }
];

export const SEED_CATEGORIES = [
  { id: "cat-formal", name: "مانتو کتی و اداری", slug: "formal", count: 4 },
  { id: "cat-jacquard", name: "مانتو مجلسی و ژاکارد", slug: "jacquard", count: 3 },
  { id: "cat-casual", name: "مانتو اسپرت و روزمره", slug: "casual", count: 3 },
  { id: "cat-linen", name: "مانتو تابستانه و لینن", slug: "linen", count: 3 },
  { id: "cat-autumn", name: "بارانی و ترنچ‌کت پاییزه", slug: "autumn", count: 3 }
];

export const SEED_PRODUCTS = [
  {
    id: "prod-001",
    sku: "MM-KT-101",
    title: "مانتو کتی یقه انگلیسی دبل‌برست الیزا",
    slug: "manto-kati-eliza",
    category: "مانتو کتی و اداری",
    categoryId: "cat-formal",
    material: "کرپ باربی ژاپنی اعلا",
    season: "چهار فصل",
    description: "مانتو کتی دبل برست با برش دقیق لیزری و آستر دوزی کامل ابریشمی. لایی کشی سرتاسری برای حفظ فرم مجلسی و ایستایی بی‌نقص در قرارهای کاری و مجالس رسمی.",
    retailPrice: 1850000,
    wholesalePrice: 1120000,
    wholesaleMinQuantity: 6,
    isFeatured: true,
    isActive: true,
    rating: 4.9,
    reviewsCount: 38,
    images: [
      "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80"
    ],
    variants: [
      { id: "var-001-1", color: "مشکی زغالی", colorHex: "#1a1a1a", size: "38", stock: 15, sku: "MM-KT-101-BLK-38" },
      { id: "var-001-2", color: "مشکی زغالی", colorHex: "#1a1a1a", size: "40", stock: 22, sku: "MM-KT-101-BLK-40" },
      { id: "var-001-3", color: "مشکی زغالی", colorHex: "#1a1a1a", size: "42", stock: 18, sku: "MM-KT-101-BLK-42" },
      { id: "var-001-4", color: "کرم خاکی", colorHex: "#d4b996", size: "38", stock: 12, sku: "MM-KT-101-CRM-38" },
      { id: "var-001-5", color: "کرم خاکی", colorHex: "#d4b996", size: "40", stock: 14, sku: "MM-KT-101-CRM-40" },
      { id: "var-001-6", color: "سرمه‌ای کلاسیک", colorHex: "#1b2a4a", size: "40", stock: 20, sku: "MM-KT-101-NVY-40" }
    ]
  },
  {
    id: "prod-002",
    sku: "MM-JQ-202",
    title: "مانتو ژاکارد ترک طرح سیم‌بافت زرین",
    slug: "manto-jacquard-zarrin",
    category: "مانتو مجلسی و ژاکارد",
    categoryId: "cat-jacquard",
    material: "ژاکارد ترک وارداتی با بافت گل‌برجسته زرین",
    season: "بهار و پاییز",
    description: "مانتو مجلسی فاخر با پارچه ژاکارد وارداتی اصل ترکیه. جلوه ابریشمی با تاروپود سیم براق بدون حساسیت، مناسب مهمانی‌ها، جشن‌ها و مراسم ویژه.",
    retailPrice: 2450000,
    wholesalePrice: 1580000,
    wholesaleMinQuantity: 6,
    isFeatured: true,
    isActive: true,
    rating: 4.8,
    reviewsCount: 52,
    images: [
      "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80"
    ],
    variants: [
      { id: "var-002-1", color: "کرم طلایی", colorHex: "#c9a66b", size: "38", stock: 10, sku: "MM-JQ-202-GLD-38" },
      { id: "var-002-2", color: "کرم طلایی", colorHex: "#c9a66b", size: "40", stock: 16, sku: "MM-JQ-202-GLD-40" },
      { id: "var-002-3", color: "کرم طلایی", colorHex: "#c9a66b", size: "42", stock: 14, sku: "MM-JQ-202-GLD-42" },
      { id: "var-002-4", color: "سبد زمردی زرین", colorHex: "#1f4a38", size: "40", stock: 8, sku: "MM-JQ-202-EMR-40" }
    ]
  },
  {
    id: "prod-003",
    sku: "MM-LN-303",
    title: "مانتو لینن تنفس‌پذیر فری‌سایز نسیم",
    slug: "manto-linen-nasim",
    category: "مانتو تابستانه و لینن",
    categoryId: "cat-linen",
    material: "لینن ۱۰۰٪ طبیعی شسته‌شده بدون آبرفت",
    season: "تابستان",
    description: "مانتو فوق‌العاده خنک و سبک با استایل اورسایز و راحت. دارای جیب‌های کاربردی و دوخت مقاوم دوبل. کاملاً ضد تعریق با لطافت بالا برای روزهای گرم سال.",
    retailPrice: 1180000,
    wholesalePrice: 690000,
    wholesaleMinQuantity: 8,
    isFeatured: true,
    isActive: true,
    rating: 4.7,
    reviewsCount: 64,
    images: [
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=800&q=80"
    ],
    variants: [
      { id: "var-003-1", color: "سبز زیتونی", colorHex: "#556b2f", size: "فری‌سایز (۳۶ تا ۴۴)", stock: 30, sku: "MM-LN-303-OLV-FS" },
      { id: "var-003-2", color: "آجری طبیعی", colorHex: "#b85d38", size: "فری‌سایز (۳۶ تا ۴۴)", stock: 25, sku: "MM-LN-303-BRK-FS" },
      { id: "var-003-3", color: "سفید استخوانی", colorHex: "#f5f2eb", size: "فری‌سایز (۳۶ تا ۴۴)", stock: 40, sku: "MM-LN-303-WHT-FS" }
    ]
  },
  {
    id: "prod-004",
    sku: "MM-TC-404",
    title: "ترنچ‌کت ضدآب کمربنددار لندن استایل",
    slug: "trenchcoat-london-style",
    category: "بارانی و ترنچ‌کت پاییزه",
    categoryId: "cat-autumn",
    material: "پارچه گاباردین ضدآب بارانی با آستر چاپی",
    season: "پاییز و زمستان",
    description: "بارانی کلاسیک ۶ دکمه با کمربند سگک‌دار فلزی، پاگون سرشانه و یقه شکاری. عایق باد و آب مناسب فصول بارانی با طراحی لوکس و جذاب.",
    retailPrice: 2150000,
    wholesalePrice: 1350000,
    wholesaleMinQuantity: 6,
    isFeatured: false,
    isActive: true,
    rating: 4.9,
    reviewsCount: 29,
    images: [
      "https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=800&q=80"
    ],
    variants: [
      { id: "var-004-1", color: "شتری کاراملی", colorHex: "#c19a6b", size: "38", stock: 12, sku: "MM-TC-404-CML-38" },
      { id: "var-004-2", color: "شتری کاراملی", colorHex: "#c19a6b", size: "40", stock: 15, sku: "MM-TC-404-CML-40" },
      { id: "var-004-3", color: "مشکی مات", colorHex: "#222222", size: "40", stock: 18, sku: "MM-TC-404-BLK-40" }
    ]
  },
  {
    id: "prod-005",
    sku: "MM-CS-505",
    title: "مانتو دانشجویی و اسپرت کتان استریت",
    slug: "manto-casual-street",
    category: "مانتو اسپرت و روزمره",
    categoryId: "cat-casual",
    material: "کتان کاغذی درجه یک با تراکم بالا",
    season: "چهار فصل",
    description: "مانتو اسپرت جلو بستنی با دکمه‌های مخفی و جیب‌های پاکتی کاربردی. انتخابی عالی برای استفاده روزمره، محیط‌های دانشگاهی و اداری نیمه‌رسمی.",
    retailPrice: 980000,
    wholesalePrice: 580000,
    wholesaleMinQuantity: 8,
    isFeatured: false,
    isActive: true,
    rating: 4.6,
    reviewsCount: 45,
    images: [
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80"
    ],
    variants: [
      { id: "var-005-1", color: "طوسی دودی", colorHex: "#708090", size: "38", stock: 20, sku: "MM-CS-505-GRY-38" },
      { id: "var-005-2", color: "طوسی دودی", colorHex: "#708090", size: "40", stock: 25, sku: "MM-CS-505-GRY-40" },
      { id: "var-005-3", color: "سبز یشمی", colorHex: "#2e473b", size: "38", stock: 15, sku: "MM-CS-505-GRN-38" }
    ]
  }
];

export const SEED_ORDERS = [
  {
    id: "ord-1001",
    orderNumber: "MM-ORD-2026-1001",
    userId: "usr-wholesale-01",
    userFullName: "سارا راد (بوتیک الیزه)",
    userEmail: "boutique.tehran@manto.ir",
    orderType: "WHOLESALE",
    status: "PROCESSING",
    items: [
      {
        productId: "prod-001",
        productTitle: "مانتو کتی یقه انگلیسی دبل‌برست الیزا",
        variantId: "var-001-2",
        color: "مشکی زغالی",
        size: "40",
        unitPrice: 1120000,
        quantity: 10,
        totalPrice: 11200000
      },
      {
        productId: "prod-002",
        productTitle: "مانتو ژاکارد ترک طرح سیم‌بافت زرین",
        variantId: "var-002-2",
        color: "کرم طلایی",
        size: "40",
        unitPrice: 1580000,
        quantity: 6,
        totalPrice: 9480000
      }
    ],
    totalAmount: 20680000,
    discountAmount: 0,
    payableAmount: 20680000,
    paymentStatus: "PAID",
    paymentMethod: "BANK_TRANSFER_RECEIPT",
    shippingAddress: {
      recipientName: "سارا راد",
      phone: "09122222222",
      province: "تهران",
      city: "تهران",
      fullAddress: "تهران، میدان ونک، مرکز تجاری آسمان، طبقه اول، پلاک ۴۲",
      postalCode: "1994833211"
    },
    createdAt: "2026-09-02T16:40:00Z"
  },
  {
    id: "ord-1002",
    orderNumber: "MM-ORD-2026-1002",
    userId: "usr-retail-01",
    userFullName: "ندا علوی",
    userEmail: "neda.alavi@gmail.com",
    orderType: "RETAIL",
    status: "SHIPPED",
    items: [
      {
        productId: "prod-003",
        productTitle: "مانتو لینن تنفس‌پذیر فری‌سایز نسیم",
        variantId: "var-003-3",
        color: "سفید استخوانی",
        size: "فری‌سایز (۳۶ تا ۴۴)",
        unitPrice: 1180000,
        quantity: 1,
        totalPrice: 1180000
      }
    ],
    totalAmount: 1180000,
    discountAmount: 50000,
    payableAmount: 1130000,
    paymentStatus: "PAID",
    paymentMethod: "ONLINE_GATEWAY",
    shippingAddress: {
      recipientName: "ندا علوی",
      phone: "09123333333",
      province: "تهران",
      city: "تهران",
      fullAddress: "تهران، سعادت آباد، خیابان سرو غربی، کوچه ارغوان، پلاک ۱۸",
      postalCode: "1998765432"
    },
    createdAt: "2026-09-03T11:20:00Z"
  }
];
