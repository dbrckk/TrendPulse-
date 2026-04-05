(function () {
  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }

  function textSeed(product) {
    return [
      product?.asin || "",
      product?.slug || "",
      product?.name || "",
      product?.category || "",
      product?.brand || ""
    ].join("|");
  }

  function hashString(input = "") {
    let hash = 0;
    const str = String(input);
    for (let i = 0; i < str.length; i += 1) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function seededPick(list, seedText) {
    if (!Array.isArray(list) || !list.length) return "";
    const index = hashString(seedText) % list.length;
    return list[index];
  }

  function inferProductType(product) {
    const haystack = [
      product?.name,
      product?.description,
      product?.short_description,
      product?.category,
      product?.brand
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const rules = [
      ["audio", ["earbuds", "headphones", "speaker", "soundbar", "microphone"]],
      ["computer", ["laptop", "keyboard", "mouse", "monitor", "ssd", "router", "webcam"]],
      ["phone", ["iphone", "ipad", "galaxy", "android", "phone", "charger", "usb-c", "magsafe"]],
      ["kitchen", ["air fryer", "blender", "knife", "cookware", "pan", "coffee", "espresso", "toaster"]],
      ["home", ["vacuum", "pillow", "blanket", "organizer", "storage", "cleaner", "lamp"]],
      ["beauty", ["serum", "moisturizer", "cleanser", "makeup", "skincare", "shampoo", "conditioner"]],
      ["fitness", ["dumbbell", "yoga", "fitness", "running", "gym", "resistance", "treadmill"]],
      ["travel", ["luggage", "backpack", "travel", "carry-on", "passport", "suitcase"]],
      ["fashion", ["wallet", "watch", "necklace", "bracelet", "ring", "dress", "bag", "handbag"]],
      ["family", ["baby", "stroller", "diaper", "dog", "cat", "pet", "nursery"]]
    ];

    for (const [type, keywords] of rules) {
      if (keywords.some((keyword) => haystack.includes(keyword))) {
        return type;
      }
    }

    return "generic";
  }

  function getHook(product) {
    const type = inferProductType(product);
    const seed = `${textSeed(product)}|hook`;

    const generic = [
      "This is selling out fast",
      "Everyone is buying this right now",
      "This is blowing up right now",
      "People are obsessed with this",
      "This feels way more expensive than it is",
      "One of those products people instantly add to cart"
    ];

    const byType = {
      audio: [
        "This sounds way better than the price suggests",
        "People keep buying this instead of pricier audio gear",
        "If you want a cheap audio win, this is it",
        "This is one of those instant audio upgrades"
      ],
      computer: [
        "This makes your setup feel instantly better",
        "One of the easiest desk upgrades right now",
        "People keep grabbing this for their setup",
        "A simple upgrade that feels bigger than expected"
      ],
      phone: [
        "A small phone upgrade that makes daily life easier",
        "This is the kind of accessory people rebuy fast",
        "One of the easiest phone upgrades right now",
        "People keep grabbing this because it just makes sense"
      ],
      kitchen: [
        "This makes daily cooking way easier",
        "One of those kitchen buys people wish they got sooner",
        "This is quietly becoming a kitchen favorite",
        "A kitchen upgrade people keep recommending"
      ],
      home: [
        "A small home upgrade that makes a big difference",
        "This is the kind of home item people keep reordering",
        "One of those products that instantly feels useful",
        "This makes everyday home life noticeably easier"
      ],
      beauty: [
        "People keep rebuying this for a reason",
        "This beauty pick is getting a lot of attention",
        "One of the easiest self-care upgrades right now",
        "This is the kind of beauty product people stick with"
      ],
      fitness: [
        "A simple fitness buy that people actually use",
        "This keeps showing up in people’s workout setups",
        "One of the easiest upgrades for training at home",
        "This is getting picked up fast by fitness shoppers"
      ],
      travel: [
        "One of those travel buys that just makes sense",
        "People keep grabbing this before trips",
        "A small travel upgrade that saves hassle",
        "This is the kind of travel item you notice immediately"
      ],
      fashion: [
        "This is getting picked up fast right now",
        "A low-effort style upgrade people keep buying",
        "One of those accessories that works with everything",
        "This feels more premium than the price suggests"
      ],
      family: [
        "A practical buy people keep coming back for",
        "This is one of those useful family purchases",
        "People keep grabbing this because it solves a real need",
        "A simple family pick with strong everyday value"
      ]
    };

    const source = byType[type] || generic;
    return seededPick(source, seed) || seededPick(generic, seed);
  }

  function getUrgency(product) {
    const price = safeNumber(product?.price, 0);
    const rating = safeNumber(product?.amazon_rating, 0);
    const reviews = safeNumber(product?.amazon_review_count, 0);
    const discount = safeNumber(product?.discount_percentage, 0);
    const seed = `${textSeed(product)}|urgency`;

    const strong = [
      "Selling fast",
      "Limited stock",
      "Deal ending soon",
      "Popular right now"
    ];

    const soft = [
      "High demand",
      "Trending now",
      "Frequently bought",
      "People keep adding this"
    ];

    if (discount >= 30 || reviews >= 10000) {
      return seededPick(strong, seed);
    }

    if (rating >= 4.5 || price > 0) {
      return seededPick([...soft, ...strong], seed);
    }

    return seededPick(soft, seed);
  }

  function getSocialProof(product) {
    const reviews = safeNumber(product?.amazon_review_count, 0);
    const rating = safeNumber(product?.amazon_rating, 0);
    const seed = `${textSeed(product)}|proof`;

    if (reviews >= 50000) return "Huge review count";
    if (reviews >= 10000) return "Massively reviewed";
    if (reviews >= 3000) return "Strong review volume";
    if (rating >= 4.7) return seededPick(["Highly rated", "Top rated", "Loved by buyers"], seed);
    if (rating >= 4.4) return seededPick(["Well rated", "Buyer favorite", "Trusted pick"], seed);

    return seededPick(["Popular pick", "Strong demand", "Frequently bought"], seed);
  }

  function getPriceStory(product) {
    const price = safeNumber(product?.price, 0);
    const original = safeNumber(product?.original_price, 0);
    const discount = safeNumber(product?.discount_percentage, 0);

    if (original > price && price > 0) {
      const pct = Math.max(1, Math.round(((original - price) / original) * 100));
      return `-${pct}% vs usual`;
    }

    if (discount >= 20) return `-${Math.round(discount)}% right now`;
    if (price > 0 && price <= 25) return "Low-price pick";
    if (price > 0 && price <= 50) return "Good value tier";

    return "High-demand product";
  }

  window.ProductHooks = {
    safeNumber,
    normalize,
    inferProductType,
    getHook,
    getUrgency,
    getSocialProof,
    getPriceStory
  };
})();
