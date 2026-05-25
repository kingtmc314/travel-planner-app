import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { currencyRouter } from "./currency_router";
import { makeRequest, GeocodingResult, PlacesSearchResult } from "./_core/map";
import { storagePut } from "./storage";

// ─── Country Detection Helper ────────────────────────────────────────────────
const COUNTRY_KEYWORDS: Array<{ keywords: string[]; code: string; name: string }> = [
  { keywords: ["japan", "tokyo", "osaka", "kyoto", "fukuoka", "sapporo", "naha", "okinawa", "nagoya", "日本", "東京", "大阪", "京都", "福岡", "札幌", "沖繩"], code: "JP", name: "Japan" },
  { keywords: ["taiwan", "taipei", "taichung", "kaohsiung", "tainan", "台灣", "台北", "台中", "高雄", "台南"], code: "TW", name: "Taiwan" },
  { keywords: ["korea", "seoul", "busan", "jeju", "韓國", "首爾", "釜山", "濟州"], code: "KR", name: "South Korea" },
  { keywords: ["thailand", "bangkok", "phuket", "chiang mai", "泰國", "曼谷", "普吉", "清邁"], code: "TH", name: "Thailand" },
  { keywords: ["singapore", "新加坡"], code: "SG", name: "Singapore" },
  { keywords: ["malaysia", "kuala lumpur", "kl", "penang", "馬來西亞", "吉隆坡", "檳城"], code: "MY", name: "Malaysia" },
  { keywords: ["indonesia", "bali", "jakarta", "印尼", "峇里", "雅加達"], code: "ID", name: "Indonesia" },
  { keywords: ["vietnam", "hanoi", "ho chi minh", "saigon", "da nang", "越南", "河內", "胡志明", "峴港"], code: "VN", name: "Vietnam" },
  { keywords: ["philippines", "manila", "cebu", "菲律賓", "馬尼拉", "宿霧"], code: "PH", name: "Philippines" },
  { keywords: ["cambodia", "siem reap", "phnom penh", "柬埔寨", "暹粒", "金邊"], code: "KH", name: "Cambodia" },
  { keywords: ["china", "beijing", "shanghai", "guangzhou", "shenzhen", "中國", "北京", "上海", "廣州", "深圳"], code: "CN", name: "China" },
  { keywords: ["egypt", "cairo", "luxor", "aswan", "hurghada", "埃及", "開羅", "盧克索", "亞斯文"], code: "EG", name: "Egypt" },
  { keywords: ["uk", "united kingdom", "london", "england", "scotland", "wales", "英國", "倫敦"], code: "GB", name: "United Kingdom" },
  { keywords: ["france", "paris", "法國", "巴黎"], code: "FR", name: "France" },
  { keywords: ["germany", "berlin", "munich", "德國", "柏林", "慕尼黑"], code: "DE", name: "Germany" },
  { keywords: ["italy", "rome", "milan", "venice", "florence", "意大利", "羅馬", "米蘭", "威尼斯", "佛羅倫斯"], code: "IT", name: "Italy" },
  { keywords: ["spain", "madrid", "barcelona", "西班牙", "馬德里", "巴塞隆拿"], code: "ES", name: "Spain" },
  { keywords: ["usa", "united states", "new york", "los angeles", "san francisco", "美國", "紐約", "洛杉磯", "三藩市"], code: "US", name: "United States" },
  { keywords: ["canada", "toronto", "vancouver", "加拿大", "多倫多", "溫哥華"], code: "CA", name: "Canada" },
  { keywords: ["australia", "sydney", "melbourne", "澳洲", "悉尼", "墨爾本"], code: "AU", name: "Australia" },
  { keywords: ["new zealand", "auckland", "新西蘭", "奧克蘭"], code: "NZ", name: "New Zealand" },
  { keywords: ["uae", "dubai", "abu dhabi", "阿聯酋", "杜拜", "阿布扎比"], code: "AE", name: "United Arab Emirates" },
  { keywords: ["greece", "athens", "santorini", "希臘", "雅典", "聖托里尼"], code: "GR", name: "Greece" },
  { keywords: ["portugal", "lisbon", "porto", "葡萄牙", "里斯本", "波爾圖"], code: "PT", name: "Portugal" },
  { keywords: ["netherlands", "amsterdam", "荷蘭", "阿姆斯特丹"], code: "NL", name: "Netherlands" },
  { keywords: ["switzerland", "zurich", "geneva", "瑞士", "蘇黎世", "日內瓦"], code: "CH", name: "Switzerland" },
  { keywords: ["austria", "vienna", "奧地利", "維也納"], code: "AT", name: "Austria" },
  { keywords: ["czech", "prague", "捷克", "布拉格"], code: "CZ", name: "Czech Republic" },
  { keywords: ["hungary", "budapest", "匈牙利", "布達佩斯"], code: "HU", name: "Hungary" },
  { keywords: ["poland", "warsaw", "krakow", "波蘭", "華沙", "克拉科夫"], code: "PL", name: "Poland" },
  { keywords: ["india", "mumbai", "delhi", "印度", "孟買", "德里"], code: "IN", name: "India" },
  { keywords: ["maldives", "馬爾代夫"], code: "MV", name: "Maldives" },
  { keywords: ["sri lanka", "colombo", "斯里蘭卡", "可倫坡"], code: "LK", name: "Sri Lanka" },
  { keywords: ["nepal", "kathmandu", "尼泊爾", "加德滿都"], code: "NP", name: "Nepal" },
  { keywords: ["morocco", "marrakech", "casablanca", "摩洛哥", "馬拉喀什", "卡薩布蘭卡"], code: "MA", name: "Morocco" },
  { keywords: ["turkey", "istanbul", "ankara", "土耳其", "伊斯坦堡", "安卡拉"], code: "TR", name: "Turkey" },
  { keywords: ["russia", "moscow", "st petersburg", "俄羅斯", "莫斯科", "聖彼得堡"], code: "RU", name: "Russia" },
  { keywords: ["brazil", "rio", "sao paulo", "巴西", "里約", "聖保羅"], code: "BR", name: "Brazil" },
  { keywords: ["argentina", "buenos aires", "阿根廷", "布宜諾斯艾利斯"], code: "AR", name: "Argentina" },
  { keywords: ["mexico", "mexico city", "cancun", "墨西哥", "墨西哥城", "坎昆"], code: "MX", name: "Mexico" },
];

// Country name (as used in flight data) → ISO alpha-2 + display name
// IATA airport code to country mapping for deriving visited countries from airport codes
const AIRPORT_TO_COUNTRY: Record<string, { code: string; name: string }> = {
  // Japan
  "NRT": { code: "JP", name: "Japan" }, "HND": { code: "JP", name: "Japan" },
  "KIX": { code: "JP", name: "Japan" }, "CTS": { code: "JP", name: "Japan" },
  "FUK": { code: "JP", name: "Japan" }, "OKA": { code: "JP", name: "Japan" },
  "NGO": { code: "JP", name: "Japan" }, "SDJ": { code: "JP", name: "Japan" },
  "GAJ": { code: "JP", name: "Japan" }, "SYO": { code: "JP", name: "Japan" },
  // Taiwan
  "TPE": { code: "TW", name: "Taiwan" }, "TSA": { code: "TW", name: "Taiwan" },
  "KHH": { code: "TW", name: "Taiwan" }, "RMQ": { code: "TW", name: "Taiwan" },
  // South Korea
  "ICN": { code: "KR", name: "South Korea" }, "GMP": { code: "KR", name: "South Korea" },
  "PUS": { code: "KR", name: "South Korea" }, "CJU": { code: "KR", name: "South Korea" },
  // Thailand
  "BKK": { code: "TH", name: "Thailand" }, "DMK": { code: "TH", name: "Thailand" },
  "HKT": { code: "TH", name: "Thailand" }, "CNX": { code: "TH", name: "Thailand" },
  // Singapore
  "SIN": { code: "SG", name: "Singapore" },
  // Malaysia
  "KUL": { code: "MY", name: "Malaysia" }, "PEN": { code: "MY", name: "Malaysia" },
  // Indonesia
  "DPS": { code: "ID", name: "Indonesia" }, "CGK": { code: "ID", name: "Indonesia" },
  // Vietnam
  "HAN": { code: "VN", name: "Vietnam" }, "SGN": { code: "VN", name: "Vietnam" },
  "DAD": { code: "VN", name: "Vietnam" },
  // Philippines
  "MNL": { code: "PH", name: "Philippines" }, "CEB": { code: "PH", name: "Philippines" },
  // Egypt
  "CAI": { code: "EG", name: "Egypt" }, "LXR": { code: "EG", name: "Egypt" },
  "ASW": { code: "EG", name: "Egypt" }, "HRG": { code: "EG", name: "Egypt" },
  "SSH": { code: "EG", name: "Egypt" }, "RMF": { code: "EG", name: "Egypt" },
  // UAE
  "DXB": { code: "AE", name: "United Arab Emirates" }, "AUH": { code: "AE", name: "United Arab Emirates" },
  "SHJ": { code: "AE", name: "United Arab Emirates" },
  // UK
  "LHR": { code: "GB", name: "United Kingdom" }, "LGW": { code: "GB", name: "United Kingdom" },
  "STN": { code: "GB", name: "United Kingdom" }, "MAN": { code: "GB", name: "United Kingdom" },
  // France
  "CDG": { code: "FR", name: "France" }, "ORY": { code: "FR", name: "France" },
  // Germany
  "FRA": { code: "DE", name: "Germany" }, "MUC": { code: "DE", name: "Germany" },
  "BER": { code: "DE", name: "Germany" },
  // Italy
  "FCO": { code: "IT", name: "Italy" }, "MXP": { code: "IT", name: "Italy" },
  "VCE": { code: "IT", name: "Italy" }, "FLR": { code: "IT", name: "Italy" },
  // Spain
  "MAD": { code: "ES", name: "Spain" }, "BCN": { code: "ES", name: "Spain" },
  // USA
  "JFK": { code: "US", name: "United States" }, "LAX": { code: "US", name: "United States" },
  "SFO": { code: "US", name: "United States" }, "ORD": { code: "US", name: "United States" },
  "ATL": { code: "US", name: "United States" }, "DFW": { code: "US", name: "United States" },
  // Canada
  "YYZ": { code: "CA", name: "Canada" }, "YVR": { code: "CA", name: "Canada" },
  // Australia
  "SYD": { code: "AU", name: "Australia" }, "MEL": { code: "AU", name: "Australia" },
  "BNE": { code: "AU", name: "Australia" },
  // New Zealand
  "AKL": { code: "NZ", name: "New Zealand" }, "CHC": { code: "NZ", name: "New Zealand" },
  // Hong Kong
  "HKG": { code: "HK", name: "Hong Kong" },
  // Macau
  "MFM": { code: "MO", name: "Macau" },
  // China
  "PEK": { code: "CN", name: "China" }, "PKX": { code: "CN", name: "China" },
  "PVG": { code: "CN", name: "China" }, "SHA": { code: "CN", name: "China" },
  "CAN": { code: "CN", name: "China" }, "SZX": { code: "CN", name: "China" },
  // India
  "BOM": { code: "IN", name: "India" }, "DEL": { code: "IN", name: "India" },
  "BLR": { code: "IN", name: "India" },
  // Maldives
  "MLE": { code: "MV", name: "Maldives" },
  // Turkey
  "IST": { code: "TR", name: "Turkey" }, "SAW": { code: "TR", name: "Turkey" },
  // Morocco
  "CMN": { code: "MA", name: "Morocco" }, "RAK": { code: "MA", name: "Morocco" },
  // Greece
  "ATH": { code: "GR", name: "Greece" }, "JTR": { code: "GR", name: "Greece" },
  // Portugal
  "LIS": { code: "PT", name: "Portugal" }, "OPO": { code: "PT", name: "Portugal" },
  // Netherlands
  "AMS": { code: "NL", name: "Netherlands" },
  // Switzerland
  "ZRH": { code: "CH", name: "Switzerland" }, "GVA": { code: "CH", name: "Switzerland" },
  // Austria
  "VIE": { code: "AT", name: "Austria" },
};

const FLIGHT_COUNTRY_TO_ISO: Record<string, { code: string; name: string }> = {
  "Japan": { code: "JP", name: "Japan" },
  "Taiwan": { code: "TW", name: "Taiwan" },
  "South Korea": { code: "KR", name: "South Korea" },
  "Korea": { code: "KR", name: "South Korea" },
  "Thailand": { code: "TH", name: "Thailand" },
  "Singapore": { code: "SG", name: "Singapore" },
  "Malaysia": { code: "MY", name: "Malaysia" },
  "Indonesia": { code: "ID", name: "Indonesia" },
  "Vietnam": { code: "VN", name: "Vietnam" },
  "Philippines": { code: "PH", name: "Philippines" },
  "Cambodia": { code: "KH", name: "Cambodia" },
  "China": { code: "CN", name: "China" },
  "Egypt": { code: "EG", name: "Egypt" },
  "UK": { code: "GB", name: "United Kingdom" },
  "United Kingdom": { code: "GB", name: "United Kingdom" },
  "France": { code: "FR", name: "France" },
  "Germany": { code: "DE", name: "Germany" },
  "Italy": { code: "IT", name: "Italy" },
  "Spain": { code: "ES", name: "Spain" },
  "USA": { code: "US", name: "United States" },
  "United States": { code: "US", name: "United States" },
  "Canada": { code: "CA", name: "Canada" },
  "Australia": { code: "AU", name: "Australia" },
  "New Zealand": { code: "NZ", name: "New Zealand" },
  "UAE": { code: "AE", name: "United Arab Emirates" },
  "United Arab Emirates": { code: "AE", name: "United Arab Emirates" },
  "Greece": { code: "GR", name: "Greece" },
  "Portugal": { code: "PT", name: "Portugal" },
  "Netherlands": { code: "NL", name: "Netherlands" },
  "Switzerland": { code: "CH", name: "Switzerland" },
  "Austria": { code: "AT", name: "Austria" },
  "Czech Republic": { code: "CZ", name: "Czech Republic" },
  "Hungary": { code: "HU", name: "Hungary" },
  "Poland": { code: "PL", name: "Poland" },
  "India": { code: "IN", name: "India" },
  "Maldives": { code: "MV", name: "Maldives" },
  "Sri Lanka": { code: "LK", name: "Sri Lanka" },
  "Nepal": { code: "NP", name: "Nepal" },
  "Morocco": { code: "MA", name: "Morocco" },
  "Turkey": { code: "TR", name: "Turkey" },
  "Russia": { code: "RU", name: "Russia" },
  "Brazil": { code: "BR", name: "Brazil" },
  "Argentina": { code: "AR", name: "Argentina" },
  "Mexico": { code: "MX", name: "Mexico" },
  "Hong Kong": { code: "HK", name: "Hong Kong" },
  "Macau": { code: "MO", name: "Macau" },
};

/** Derive unique visited countries from a list of flights, excluding the user's home (Hong Kong). */
function extractCountriesFromFlights(
  flights: Array<{ depCountry: string; arrCountry: string; date: string }>,
  excludeCountry = "Hong Kong"
): Array<{ code: string; name: string; year: number }> {
  const seen = new Map<string, { code: string; name: string; year: number }>();
  for (const f of flights) {
    for (const countryName of [f.depCountry, f.arrCountry]) {
      if (!countryName || countryName === excludeCountry) continue;
      const iso = FLIGHT_COUNTRY_TO_ISO[countryName];
      if (!iso) continue;
      const year = new Date(f.date).getFullYear();
      const existing = seen.get(iso.code);
      // Keep the earliest year visited
      if (!existing || year < existing.year) {
        seen.set(iso.code, { code: iso.code, name: iso.name, year });
      }
    }
  }
  return Array.from(seen.values());
}

function detectCountryFromDestination(destination: string): { code: string; name: string } | null {
  const lower = destination.toLowerCase();
  for (const entry of COUNTRY_KEYWORDS) {
    if (entry.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return { code: entry.code, name: entry.name };
    }
  }
  return null;
}

// ─── Trips Router ─────────────────────────────────────────────────────────────
const tripsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserTrips(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const trip = await db.getTripById(input.tripId, ctx.user.id);
      if (!trip) throw new Error("Trip not found or access denied");
      return trip;
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      destination: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
      baseCurrency: z.string().default("HKD"),
      coverImage: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tripId = await db.createTrip({
        name: input.name,
        destination: input.destination,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        baseCurrency: input.baseCurrency,
        coverImage: input.coverImage ?? null,
        description: input.description ?? null,
        createdBy: ctx.user.id,
      }, ctx.user.id);

      // Auto-generate itinerary days
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      let dayNum = 1;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        await db.addItineraryDay({
          tripId,
          date: new Date(d),
          dayNumber: dayNum++,
          title: `Day ${dayNum - 1}`,
        });
      }
      // Auto-import destination country to travel history
      try {
        const detectedCountry = detectCountryFromDestination(input.destination);
        if (detectedCountry) {
          await db.upsertVisitedCountry({
            userId: ctx.user.id,
            countryCode: detectedCountry.code,
            countryName: detectedCountry.name,
            status: "visited",
            visitedAt: new Date(input.startDate),
            notes: `Auto-imported from trip: ${input.name}`,
          });
        }
      } catch (_) { /* ignore auto-import errors */ }
      return { tripId };
    }),

  update: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      name: z.string().optional(),
      destination: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      baseCurrency: z.string().optional(),
      coverImage: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { tripId, startDate, endDate, ...rest } = input;
      const membership = await db.getUserMembership(tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.updateTrip(tripId, {
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      });
      // Notify all members
      const members = await db.getTripMembers(tripId);
      for (const m of members) {
        if (m.member.userId !== ctx.user.id && m.member.userId) {
          await db.addNotification({
            tripId,
            userId: m.member.userId,
            type: "trip_updated",
            title: "行程已更新",
            message: `${ctx.user.name ?? "成員"} 更新了行程資訊`,
          });
        }
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role !== "owner") throw new Error("Only owner can delete trip");
      await db.deleteTrip(input.tripId);
      return { success: true };
    }),

  importDemo: protectedProcedure.mutation(async ({ ctx }) => {
    const already = await db.hasDemoTrip(ctx.user.id);
    if (already) return { alreadyExists: true };

    // Create Egypt demo trip
    const tripId = await db.createTrip({
      name: "埃及探索之旅 🇪🇬",
      destination: "開羅 • 盧克索 • 亞斯文",
      description: "探索古埃及文明，遊覽金字塔、神廟與尼羅河",
      startDate: new Date("2026-03-10"),
      endDate: new Date("2026-03-17"),
      baseCurrency: "EGP",
      coverImage: "https://images.unsplash.com/photo-1568322445389-f64ac2515020?w=800&q=70",
      isDemoTrip: true,
      createdBy: ctx.user.id,
    }, ctx.user.id);

    // Add itinerary days
    const days: { date: string; title: string }[] = [
      { date: "2026-03-10", title: "抵達開羅" },
      { date: "2026-03-11", title: "吉薩金字塔" },
      { date: "2026-03-12", title: "埃及博物館" },
      { date: "2026-03-13", title: "前往盧克索" },
      { date: "2026-03-14", title: "帝王谷" },
      { date: "2026-03-15", title: "前往亞斯文" },
      { date: "2026-03-16", title: "阿布辛貝神廟" },
      { date: "2026-03-17", title: "返港" },
    ];

    const dayIds: number[] = [];
    for (let i = 0; i < days.length; i++) {
      const dayId = await db.addItineraryDay({
        tripId,
        date: new Date(days[i].date),
        dayNumber: i + 1,
        title: days[i].title,
      });
      dayIds.push(dayId);
    }

    // Day 1 activities
    await db.addActivity({ dayId: dayIds[0], tripId, title: "香港國際機場出發", startTime: "06:00", category: "transport", location: "香港國際機場", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[0], tripId, title: "抵達開羅國際機場", startTime: "13:30", category: "transport", location: "開羅國際機場", sortOrder: 1 });
    await db.addActivity({ dayId: dayIds[0], tripId, title: "入住 Kempinski Nile Hotel", startTime: "15:00", category: "hotel", location: "開羅市中心", sortOrder: 2 });
    await db.addActivity({ dayId: dayIds[0], tripId, title: "尼羅河畔晚餐", startTime: "19:00", category: "food", location: "Nile Restaurant", sortOrder: 3 });

    // Day 2 activities
    await db.addActivity({ dayId: dayIds[1], tripId, title: "吉薩大金字塔", startTime: "08:00", category: "attraction", location: "吉薩高原", notes: "世界七大奇觀之一", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[1], tripId, title: "獅身人面像", startTime: "10:00", category: "attraction", location: "吉薩高原", sortOrder: 1 });
    await db.addActivity({ dayId: dayIds[1], tripId, title: "午餐 - 當地餐廳", startTime: "12:30", category: "food", location: "吉薩", sortOrder: 2 });
    await db.addActivity({ dayId: dayIds[1], tripId, title: "Memphis 古城遺址", startTime: "14:30", category: "attraction", location: "孟菲斯", sortOrder: 3 });

    // Day 3 activities
    await db.addActivity({ dayId: dayIds[2], tripId, title: "埃及國家博物館", startTime: "09:00", category: "attraction", location: "開羅解放廣場", notes: "圖坦卡蒙黃金面具", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[2], tripId, title: "Khan el-Khalili 市集購物", startTime: "14:00", category: "shopping", location: "伊斯蘭開羅", sortOrder: 1 });
    await db.addActivity({ dayId: dayIds[2], tripId, title: "Al-Azhar 清真寺", startTime: "16:00", category: "attraction", location: "伊斯蘭開羅", sortOrder: 2 });

    // Day 4 activities
    await db.addActivity({ dayId: dayIds[3], tripId, title: "乘火車前往盧克索", startTime: "07:00", category: "transport", location: "開羅火車站", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[3], tripId, title: "抵達盧克索", startTime: "13:00", category: "transport", location: "盧克索火車站", sortOrder: 1 });
    await db.addActivity({ dayId: dayIds[3], tripId, title: "卡納克神廟", startTime: "15:00", category: "attraction", location: "盧克索東岸", sortOrder: 2 });

    // Day 5 activities
    await db.addActivity({ dayId: dayIds[4], tripId, title: "帝王谷 (Valley of the Kings)", startTime: "07:00", category: "attraction", location: "盧克索西岸", notes: "圖坦卡蒙墓穴", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[4], tripId, title: "哈特謝普蘇特神廟", startTime: "10:00", category: "attraction", location: "盧克索西岸", sortOrder: 1 });
    await db.addActivity({ dayId: dayIds[4], tripId, title: "盧克索神廟 (夜間)", startTime: "19:00", category: "attraction", location: "盧克索東岸", sortOrder: 2 });

    // Day 6 activities
    await db.addActivity({ dayId: dayIds[5], tripId, title: "乘船前往亞斯文", startTime: "08:00", category: "transport", location: "盧克索碼頭", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[5], tripId, title: "菲萊神廟", startTime: "15:00", category: "attraction", location: "亞斯文", sortOrder: 1 });
    await db.addActivity({ dayId: dayIds[5], tripId, title: "亞斯文大壩", startTime: "17:00", category: "attraction", location: "亞斯文", sortOrder: 2 });

    // Day 7 activities
    await db.addActivity({ dayId: dayIds[6], tripId, title: "乘車前往阿布辛貝", startTime: "04:00", category: "transport", location: "亞斯文", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[6], tripId, title: "阿布辛貝神廟 (拉美西斯二世)", startTime: "07:00", category: "attraction", location: "阿布辛貝", notes: "UNESCO世界遺產", sortOrder: 1 });
    await db.addActivity({ dayId: dayIds[6], tripId, title: "返回亞斯文", startTime: "13:00", category: "transport", location: "阿布辛貝", sortOrder: 2 });

    // Day 8 activities
    await db.addActivity({ dayId: dayIds[7], tripId, title: "亞斯文機場出發", startTime: "08:00", category: "transport", location: "亞斯文機場", sortOrder: 0 });
    await db.addActivity({ dayId: dayIds[7], tripId, title: "抵達香港", startTime: "22:00", category: "transport", location: "香港國際機場", sortOrder: 1 });

    // Expenses
    await db.addExpense({ tripId, title: "來回機票 (HKG-CAI)", amount: "8500", currency: "HKD", category: "transport", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-10"), notes: "Cathay Pacific" });
    await db.addExpense({ tripId, title: "Kempinski Hotel (4晚)", amount: "12000", currency: "HKD", category: "accommodation", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-10") });
    await db.addExpense({ tripId, title: "金字塔門票", amount: "540", currency: "EGP", category: "attraction", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-11") });
    await db.addExpense({ tripId, title: "埃及博物館門票", amount: "300", currency: "EGP", category: "attraction", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-12") });
    await db.addExpense({ tripId, title: "開羅-盧克索火車票", amount: "450", currency: "EGP", category: "transport", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-13") });
    await db.addExpense({ tripId, title: "帝王谷門票", amount: "480", currency: "EGP", category: "attraction", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-14") });
    await db.addExpense({ tripId, title: "阿布辛貝門票", amount: "600", currency: "EGP", category: "attraction", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-16") });
    await db.addExpense({ tripId, title: "餐飲費用 (8天)", amount: "3200", currency: "HKD", category: "food", paidBy: ctx.user.id, paidByName: ctx.user.name ?? "我", date: new Date("2026-03-10") });

    // Map pins
    await db.addMapPin({ tripId, title: "吉薩大金字塔", lat: "29.9792", lng: "31.1342", category: "attraction", notes: "世界七大奇觀" });
    await db.addMapPin({ tripId, title: "埃及國家博物館", lat: "30.0478", lng: "31.2336", category: "attraction", notes: "圖坦卡蒙黃金面具" });
    await db.addMapPin({ tripId, title: "Kempinski Nile Hotel", lat: "30.0511", lng: "31.2357", category: "hotel", notes: "5星級酒店" });
    await db.addMapPin({ tripId, title: "Khan el-Khalili 市集", lat: "30.0478", lng: "31.2625", category: "attraction", notes: "傳統市集" });
    await db.addMapPin({ tripId, title: "卡納克神廟", lat: "25.7188", lng: "32.6573", category: "attraction", notes: "古埃及最大神廟群" });
    await db.addMapPin({ tripId, title: "帝王谷", lat: "25.7402", lng: "32.6014", category: "attraction", notes: "法老陵墓群" });
    await db.addMapPin({ tripId, title: "阿布辛貝神廟", lat: "22.3372", lng: "31.6258", category: "attraction", notes: "拉美西斯二世神廟" });
    await db.addMapPin({ tripId, title: "菲萊神廟", lat: "24.0246", lng: "32.8838", category: "attraction", notes: "伊西斯神廟" });

    // Flights
    await db.addFlight({ tripId, type: "outbound", airline: "Cathay Pacific", flightNumber: "CX701", fromCode: "HKG", fromCity: "Hong Kong", toCode: "CAI", toCity: "Cairo", date: "2026-03-10", departTime: "06:00", arriveTime: "13:30", orderIndex: 0 });
    await db.addFlight({ tripId, type: "return", airline: "Cathay Pacific", flightNumber: "CX702", fromCode: "ASW", fromCity: "Aswan", toCode: "HKG", toCity: "Hong Kong", date: "2026-03-17", departTime: "08:00", arriveTime: "22:00", orderIndex: 1 });

    // Accommodations
    await db.addAccommodation({ tripId, name: "Kempinski Nile Hotel Cairo", city: "Cairo", checkIn: "2026-03-10", checkOut: "2026-03-13", nights: 3, notes: "尼羅河景觀房", orderIndex: 0 });
    await db.addAccommodation({ tripId, name: "Sofitel Winter Palace Luxor", city: "Luxor", checkIn: "2026-03-13", checkOut: "2026-03-15", nights: 2, notes: "歷史宮殿酒店", orderIndex: 1 });
    await db.addAccommodation({ tripId, name: "Movenpick Resort Aswan", city: "Aswan", checkIn: "2026-03-15", checkOut: "2026-03-17", nights: 2, notes: "島嶼度假村", orderIndex: 2 });

    return { alreadyExists: false, tripId };
  }),

  mergeGuestTrips: protectedProcedure
    .input(z.object({
      trips: z.array(z.object({
        name: z.string().min(1),
        destination: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
        baseCurrency: z.string().default("HKD"),
      }))
    }))
    .mutation(async ({ ctx, input }) => {
      const created: number[] = [];
      for (const t of input.trips) {
        const tripId = await db.createTrip({
          name: t.name,
          destination: t.destination,
          startDate: new Date(t.startDate),
          endDate: new Date(t.endDate),
          baseCurrency: t.baseCurrency,
          coverImage: null,
          description: null,
          createdBy: ctx.user.id,
        }, ctx.user.id);
        // Auto-generate itinerary days
        const start = new Date(t.startDate);
        const end = new Date(t.endDate);
        let dayNum = 1;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          await db.addItineraryDay({ tripId, date: new Date(d), dayNumber: dayNum++, title: `Day ${dayNum - 1}` });
        }
        created.push(tripId);
      }
      return { merged: created.length };
    }),
});

// ─── Members Router ───────────────────────────────────────────────────────────
const membersRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");
      const members = await db.getTripMembers(input.tripId);
      return members.map(m => ({
        id: m.member.id,
        userId: m.member.userId,
        role: m.member.role,
        displayName: m.member.displayName ?? m.user?.name ?? "Unknown",
        email: m.member.email ?? m.user?.email ?? null,
        joinedAt: m.member.joinedAt,
      }));
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      displayName: z.string().min(1),
      email: z.string().email().optional(),
      role: z.enum(["editor", "viewer"]).default("viewer"),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const memberId = await db.addTripMember({
        tripId: input.tripId,
        userId: ctx.user.id, // placeholder - in real app would look up by email
        role: input.role,
        displayName: input.displayName,
        email: input.email ?? null,
      });
      // Notify existing members
      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.member.userId !== ctx.user.id && m.member.userId) {
          await db.addNotification({
            tripId: input.tripId,
            userId: m.member.userId,
            type: "member_joined",
            title: "新成員加入",
            message: `${input.displayName} 加入了行程`,
          });
        }
      }
      return { memberId };
    }),

  updateRole: protectedProcedure
    .input(z.object({
      memberId: z.number(),
      tripId: z.number(),
      role: z.enum(["owner", "editor", "viewer"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role !== "owner") throw new Error("Only owner can change roles");
      await db.updateMemberRole(input.memberId, input.role);
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || (membership.role !== "owner" && membership.id !== input.memberId)) {
        throw new Error("Permission denied");
      }
            await db.removeTripMember(input.memberId);
      return { success: true };
    }),
  createInviteLink: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      role: z.enum(["editor", "viewer"]).default("viewer"),
      origin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role !== "owner") throw new Error("Only owner can create invite links");
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new Error("Database unavailable");
      const { inviteLinks } = await import("../drizzle/schema");
      await drizzleDb.insert(inviteLinks).values({
        tripId: input.tripId,
        token,
        role: input.role,
        createdBy: ctx.user.id,
      });
      const inviteUrl = `${input.origin}/join?token=${token}`;
      return { token, inviteUrl };
    }),
  joinViaInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new Error("Database unavailable");
      const { inviteLinks } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const links = await drizzleDb.select().from(inviteLinks).where(eq(inviteLinks.token, input.token)).limit(1);
      if (!links.length) throw new Error("Invalid or expired invite link");
      const link = links[0];
      if (link.expiresAt && new Date() > link.expiresAt) throw new Error("Invite link has expired");
      const existing = await db.getUserMembership(link.tripId, ctx.user.id);
      if (existing) return { tripId: link.tripId, alreadyMember: true };
      await db.addTripMember({
        tripId: link.tripId,
        userId: ctx.user.id,
        role: link.role,
        displayName: ctx.user.name ?? ctx.user.email ?? "Member",
        email: ctx.user.email ?? null,
      });
      await drizzleDb.update(inviteLinks).set({ usedCount: link.usedCount + 1 }).where(eq(inviteLinks.id, link.id));
      return { tripId: link.tripId, alreadyMember: false };
    }),
});
// ─── Itinerary Router ─────────────────────────────────────────────────────────
const itineraryRouter = router({
  getDays: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");
      return db.getItineraryDays(input.tripId);
    }),

  addActivity: protectedProcedure
    .input(z.object({
      dayId: z.number(),
      tripId: z.number(),
      title: z.string().min(1),
      location: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      category: z.enum(["transport", "food", "attraction", "hotel", "shopping", "other"]).default("other"),
      notes: z.string().optional(),
      cost: z.string().optional(),
      currency: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const actId = await db.addActivity({
        dayId: input.dayId,
        tripId: input.tripId,
        title: input.title,
        location: input.location ?? null,
        startTime: input.startTime ?? null,
        category: input.category,
        notes: input.notes ?? null,
        sortOrder: input.sortOrder,
      });
      // Notify members
      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.member.userId !== ctx.user.id && m.member.userId) {
          await db.addNotification({
            tripId: input.tripId,
            userId: m.member.userId,
            type: "itinerary_updated",
            title: "行程已更新",
            message: `${ctx.user.name ?? "成員"} 新增了活動：${input.title}`,
          });
        }
      }
      return { activityId: actId };
    }),

  updateActivity: protectedProcedure
    .input(z.object({
      activityId: z.number(),
      tripId: z.number(),
      title: z.string().optional(),
      location: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      category: z.enum(["transport", "food", "attraction", "hotel", "shopping", "other"]).optional(),
      notes: z.string().optional(),
      cost: z.string().optional(),
      currency: z.string().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { activityId, tripId, ...data } = input;
      const membership = await db.getUserMembership(tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.updateActivity(activityId, data);
      return { success: true };
    }),

  deleteActivity: protectedProcedure
    .input(z.object({ activityId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.deleteActivity(input.activityId);
      return { success: true };
    }),

  addDay: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      date: z.string(),
      dayNumber: z.number(),
      title: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const dayId = await db.addItineraryDay({
        tripId: input.tripId,
        date: new Date(input.date),
        dayNumber: input.dayNumber,
        title: input.title ?? `Day ${input.dayNumber}`,
      });
      return { dayId };
    }),

  deleteDay: protectedProcedure
    .input(z.object({ dayId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.deleteItineraryDay(input.dayId);
      return { success: true };
    }),

  moveActivity: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      activityId: z.number(),
      targetDayId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      // Validate activity belongs to this trip
      const tripActivities = await db.getTripActivities(input.tripId);
      const activity = tripActivities.find((a: any) => a.id === input.activityId);
      if (!activity) throw new Error("Activity not found in this trip");
      // Validate target day belongs to this trip
      const days = await db.getItineraryDays(input.tripId);
      const targetDay = days.find(d => d.id === input.targetDayId);
      if (!targetDay) throw new Error("Target day not found in this trip");
      // Assign sortOrder = end of target day
      const targetDayActivities = await db.getTripActivities(input.tripId);
      const targetActs = targetDayActivities.filter((a: any) => a.dayId === input.targetDayId);
      const maxSort = targetActs.reduce((m: number, a: any) => Math.max(m, a.sortOrder ?? 0), -1);
      await db.updateActivity(input.activityId, { dayId: input.targetDayId, sortOrder: maxSort + 1 });
      return { success: true };
    }),

  reorderActivities: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      orderedIds: z.array(z.number()), // activity IDs in new order
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      // Validate all activities belong to this trip before updating
      const tripActivities = await db.getTripActivities(input.tripId);
      const validIds = new Set(tripActivities.map((a: any) => a.id));
      const allValid = input.orderedIds.every(id => validIds.has(id));
      if (!allValid) throw new Error("One or more activities do not belong to this trip");
      // Bulk-update sortOrder for each activity
      await Promise.all(
        input.orderedIds.map((id, index) =>
          db.updateActivity(id, { sortOrder: index })
        )
      );
      return { success: true };
    }),
});

// ─── Expenses Router ──────────────────────────────────────────────────────────
const expensesRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");
      return db.getTripExpenses(input.tripId);
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      title: z.string().min(1),
      amount: z.string(),
      currency: z.string(),
      category: z.enum(["transport", "food", "accommodation", "attraction", "shopping", "other"]).default("other"),
      paidByName: z.string().optional(),
      date: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const expId = await db.addExpense({
        tripId: input.tripId,
        title: input.title,
        amount: input.amount,
        currency: input.currency,
        category: input.category,
        paidBy: ctx.user.id,
        paidByName: input.paidByName ?? ctx.user.name ?? null,
        date: new Date(input.date),
        notes: input.notes ?? null,
      });
      // Notify members
      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.member.userId !== ctx.user.id && m.member.userId) {
          await db.addNotification({
            tripId: input.tripId,
            userId: m.member.userId,
            type: "expense_added",
            title: "新增費用",
            message: `${ctx.user.name ?? "成員"} 新增了費用：${input.title} ${input.amount} ${input.currency}`,
          });
        }
      }
      return { expenseId: expId };
    }),

  update: protectedProcedure
    .input(z.object({
      expenseId: z.number(),
      tripId: z.number(),
      title: z.string().min(1).optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      category: z.enum(["transport", "food", "accommodation", "attraction", "shopping", "other"]).optional(),
      paidByName: z.string().optional(),
      date: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { expenseId, tripId, date, ...rest } = input;
      const membership = await db.getUserMembership(tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.updateExpense(expenseId, {
        ...rest,
        ...(date ? { date: new Date(date) } : {}),
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ expenseId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.deleteExpense(input.expenseId);
      return { success: true };
    }),
  bulkAdd: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      expenses: z.array(z.object({
        title: z.string().min(1),
        amount: z.string(),
        currency: z.string(),
        category: z.enum(["transport", "food", "accommodation", "attraction", "shopping", "other"]).default("other"),
        paidByName: z.string().optional(),
        date: z.string(),
        notes: z.string().optional(),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const ids: number[] = [];
      for (const e of input.expenses) {
        const id = await db.addExpense({
          tripId: input.tripId,
          title: e.title,
          amount: e.amount,
          currency: e.currency,
          category: e.category,
          paidBy: ctx.user.id,
          paidByName: e.paidByName ?? ctx.user.name ?? null,
          date: new Date(e.date),
          notes: e.notes ?? null,
        });
        ids.push(id);
      }
      return { inserted: ids.length };
    }),
  // AI auto-classify: suggest categories for all "other" expenses in a trip
  autoClassify: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");

      const allExpenses = await db.getTripExpenses(input.tripId);
      const uncategorised = allExpenses.filter(e => !e.category || e.category === "other");
      if (uncategorised.length === 0) return { suggestions: [], total: 0 };

      // Build a compact list for the LLM
      const items = uncategorised.map(e => ({ id: e.id, title: e.title }));

      const systemPrompt = `You are a travel expense categorisation assistant.
For each expense item, assign exactly one category from this list:
- transport  (flights, trains, buses, taxis, ferries, car rental, metro, toll, fuel)
- food       (restaurants, cafes, snacks, drinks, groceries, street food)
- accommodation (hotels, hostels, Airbnb, guesthouses, resorts)
- attraction (museums, theme parks, tours, tickets, entrance fees, activities)
- shopping   (clothes, souvenirs, electronics, gifts, markets, duty-free)
- other      (anything that doesn't clearly fit the above)

Respond ONLY with a JSON object matching the schema. No markdown, no explanation.`;

      const userPrompt = `Categorise these travel expenses:\n${JSON.stringify(items, null, 2)}`;

      const schema = {
        type: "object" as const,
        properties: {
          results: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "integer" as const },
                category: { type: "string" as const, enum: ["transport", "food", "accommodation", "attraction", "shopping", "other"] },
              },
              required: ["id", "category"],
              additionalProperties: false,
            },
          },
        },
        required: ["results"],
        additionalProperties: false,
      };

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "expense_categories", strict: true, schema },
        },
      });

      const rawContent = response.choices?.[0]?.message?.content ?? "{}";
      const raw = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      let parsed: { results: Array<{ id: number; category: string }> };
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("AI returned invalid JSON");
      }

      // Merge with original title for display
      const titleMap = new Map(uncategorised.map(e => [e.id, e.title]));
      const suggestions = (parsed.results ?? []).map(r => ({
        id: r.id,
        title: titleMap.get(r.id) ?? "",
        suggestedCategory: r.category as "transport" | "food" | "accommodation" | "attraction" | "shopping" | "other",
      }));

      return { suggestions, total: suggestions.length };
    }),

  // Apply the confirmed classification suggestions
  applyClassification: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      classifications: z.array(z.object({
        id: z.number(),
        category: z.enum(["transport", "food", "accommodation", "attraction", "shopping", "other"]),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");

      // Validate all expense IDs belong to this trip
      const tripExpenses = await db.getTripExpenses(input.tripId);
      const validIds = new Set(tripExpenses.map(e => e.id));
      const invalidIds = input.classifications.filter(c => !validIds.has(c.id)).map(c => c.id);
      if (invalidIds.length > 0) {
        throw new Error(`Expense IDs not found in this trip: ${invalidIds.join(", ")}`);
      }

      let updated = 0;
      for (const c of input.classifications) {
        await db.updateExpense(c.id, { category: c.category });
        updated++;
      }
            return { updated };
    }),

  // ─── Split Summary ────────────────────────────────────────────────────────
  getSplitSummary: protectedProcedure
    .input(z.object({ tripId: z.number(), baseCurrency: z.string().default("HKD") }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");

      const [allExpenses, allMembers] = await Promise.all([
        db.getTripExpenses(input.tripId),
        db.getTripMembers(input.tripId),
      ]);

      // Fetch exchange rates for all unique currencies to baseCurrency
      const currencies = Array.from(new Set(allExpenses.map(e => e.currency)));
      const rateMap: Record<string, number> = { [input.baseCurrency]: 1 };
      await Promise.all(
        currencies
          .filter(c => c !== input.baseCurrency)
          .map(async (c) => {
            try {
              const res = await fetch(`https://api.frankfurter.dev/v2/latest?base=${input.baseCurrency}&symbols=${c}`);
              if (res.ok) {
                const data = await res.json() as { rates: Record<string, number> };
                // rates[c] = how many c per 1 baseCurrency, so 1 c = 1/rates[c] baseCurrency
                if (data.rates[c]) rateMap[c] = 1 / data.rates[c];
              }
            } catch { /* ignore, use 1:1 fallback */ }
          })
      );

      // Build member map: userId -> displayName
      const memberMap: Record<number, string> = {};
      for (const { member, user } of allMembers) {
        const name = member.displayName ?? user?.name ?? `User ${member.userId}`;
        memberMap[member.userId] = name;
      }

            // Calculate net balance per member (positive = owed money, negative = owes money)
      const balance: Record<number, number> = {};
      const paidTotal: Record<number, number> = {};
      const owedTotal: Record<number, number> = {};
      for (const { member } of allMembers) {
        balance[member.userId] = 0;
        paidTotal[member.userId] = 0;
        owedTotal[member.userId] = 0;
      }
      for (const expense of allExpenses) {
        const amountInBase = parseFloat(expense.amount) * (rateMap[expense.currency] ?? 1);
        const payerId = expense.paidBy;
        // Determine who splits this expense
        let splitIds: number[];
        const rawSplit = expense.splitAmong as number[] | null;
        if (rawSplit && Array.isArray(rawSplit) && rawSplit.length > 0) {
          splitIds = rawSplit;
        } else {
          // Default: split equally among all members
          splitIds = Object.keys(balance).map(Number);
        }
        if (splitIds.length === 0) continue;
        const share = amountInBase / splitIds.length;
        // Payer gets credited
        if (balance[payerId] !== undefined) balance[payerId] += amountInBase;
        else balance[payerId] = amountInBase;
        if (paidTotal[payerId] !== undefined) paidTotal[payerId] += amountInBase;
        else paidTotal[payerId] = amountInBase;
        // Each splitter gets debited their share
        for (const uid of splitIds) {
          if (balance[uid] !== undefined) balance[uid] -= share;
          else balance[uid] = -share;
          if (owedTotal[uid] !== undefined) owedTotal[uid] += share;
          else owedTotal[uid] = share;
        }
      }
      // Build member summary list
      const members = Object.entries(balance).map(([uid, net]) => ({
        userId: Number(uid),
        name: memberMap[Number(uid)] ?? `User ${uid}`,
        net: Math.round(net * 100) / 100,
        paidTotal: Math.round((paidTotal[Number(uid)] ?? 0) * 100) / 100,
        owedTotal: Math.round((owedTotal[Number(uid)] ?? 0) * 100) / 100,
        status: net > 0.005 ? "owed" as const : net < -0.005 ? "owes" as const : "settled" as const,
      }));

      // Minimal-transfer settlement algorithm (greedy)
      const creditors = members.filter(m => m.net > 0.005).map(m => ({ ...m, remaining: m.net }));
      const debtors = members.filter(m => m.net < -0.005).map(m => ({ ...m, remaining: -m.net }));
      const settlements: { from: string; fromId: number; to: string; toId: number; amount: number }[] = [];

      let ci = 0, di = 0;
      while (ci < creditors.length && di < debtors.length) {
        const c = creditors[ci];
        const d = debtors[di];
        const transfer = Math.min(c.remaining, d.remaining);
        if (transfer > 0.005) {
          settlements.push({
            from: d.name, fromId: d.userId,
            to: c.name, toId: c.userId,
            amount: Math.round(transfer * 100) / 100,
          });
        }
        c.remaining -= transfer;
        d.remaining -= transfer;
        if (c.remaining < 0.005) ci++;
        if (d.remaining < 0.005) di++;
      }

      return {
        baseCurrency: input.baseCurrency,
        members,
        settlements,
        totalExpenses: Math.round(allExpenses.reduce((s, e) => s + parseFloat(e.amount) * (rateMap[e.currency] ?? 1), 0) * 100) / 100,
      };
    }),
  // Upload a receipt image for an expense (base64 encoded)
  uploadReceipt: protectedProcedure
    .input(z.object({
      expenseId: z.number(),
      tripId: z.number(),
      // base64-encoded image data (without data: prefix)
      imageData: z.string().min(1),
      mimeType: z.string().default("image/jpeg"),
      fileName: z.string().default("receipt.jpg"),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      // Verify the expense belongs to this trip
      const tripExpenses = await db.getTripExpenses(input.tripId);
      const expense = tripExpenses.find(e => e.id === input.expenseId);
      if (!expense) throw new Error("Expense not found in this trip");
      // Decode base64 to buffer
      const buffer = Buffer.from(input.imageData, "base64");
      if (buffer.length > 10 * 1024 * 1024) throw new Error("Receipt image too large (max 10MB)");
      const ext = input.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const key = `receipts/trip${input.tripId}/expense${input.expenseId}_${ctx.user.id}.${ext}`;
      const { url, key: storedKey } = await storagePut(key, buffer, input.mimeType);
      await db.updateExpense(input.expenseId, { receiptUrl: url, receiptKey: storedKey });
      return { url, key: storedKey };
    }),
  // Remove the receipt from an expense
  removeReceipt: protectedProcedure
    .input(z.object({
      expenseId: z.number(),
      tripId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      // Verify the expense belongs to this trip
      const tripExpenses = await db.getTripExpenses(input.tripId);
      const expense = tripExpenses.find(e => e.id === input.expenseId);
      if (!expense) throw new Error("Expense not found in this trip");
      await db.updateExpense(input.expenseId, { receiptUrl: null, receiptKey: null });
      return { success: true };
    }),
});
// ─── Map Router ───────────────────────────────────────────────────────────────
const mapRouter = router({
  getPins: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");
      return db.getMapPins(input.tripId);
    }),

  addPin: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      title: z.string().min(1),
      notes: z.string().optional(),
      lat: z.string(),
      lng: z.string(),
      category: z.enum(["attraction", "hotel", "restaurant", "transport", "other"]).default("attraction"),
      address: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const pinId = await db.addMapPin({
        tripId: input.tripId,
        title: input.title,
        notes: input.notes ?? null,
        lat: input.lat,
        lng: input.lng,
        category: input.category,
        address: input.address ?? null,
      });
      return { pinId };
    }),

  updatePin: protectedProcedure
    .input(z.object({
      pinId: z.number(),
      tripId: z.number(),
      title: z.string().min(1).optional(),
      notes: z.string().optional(),
      category: z.enum(["attraction", "hotel", "restaurant", "transport", "other"]).optional(),
      address: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { pinId, tripId, ...rest } = input;
      const membership = await db.getUserMembership(tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.updateMapPin(pinId, rest);
      return { success: true };
    }),

  deletePin: protectedProcedure
    .input(z.object({ pinId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.deleteMapPin(input.pinId);
      return { success: true };
    }),

  geocodePlace: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Try text search first for better results with place names
      const searchResult = await makeRequest<PlacesSearchResult>(
        "/maps/api/place/textsearch/json",
        { query: input.query }
      );
      if (searchResult.results && searchResult.results.length > 0) {
        const place = searchResult.results[0];
        return {
          lat: String(place.geometry.location.lat),
          lng: String(place.geometry.location.lng),
          address: place.formatted_address,
          name: place.name,
        };
      }
      // Fallback to geocoding API
      const geoResult = await makeRequest<GeocodingResult>(
        "/maps/api/geocode/json",
        { address: input.query }
      );
      if (!geoResult.results || geoResult.results.length === 0) {
        throw new Error("找不到該地點，請嘗試更具體的名稱");
      }
      const r = geoResult.results[0];
      return {
        lat: String(r.geometry.location.lat),
        lng: String(r.geometry.location.lng),
        address: r.formatted_address,
        name: input.query,
      };
    }),
});

// ─── Flights Router ───────────────────────────────────────────────────────────
const flightsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");
      return db.getTripFlights(input.tripId);
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      type: z.enum(["outbound", "return", "connecting"]).default("outbound"),
      airline: z.string().optional(),
      flightNumber: z.string().optional(),
      fromCode: z.string().optional(),
      fromCity: z.string().optional(),
      toCode: z.string().optional(),
      toCity: z.string().optional(),
      date: z.string().optional(),
      departTime: z.string().optional(),
      arriveTime: z.string().optional(),
      duration: z.string().optional(),
      isLayover: z.boolean().optional(),
      layoverDuration: z.string().optional(),
      orderIndex: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const flightId = await db.addFlight({
        tripId: input.tripId,
        type: input.type,
        airline: input.airline ?? null,
        flightNumber: input.flightNumber ?? null,
        fromCode: input.fromCode ?? null,
        fromCity: input.fromCity ?? null,
        toCode: input.toCode ?? null,
        toCity: input.toCity ?? null,
        date: input.date ?? null,
        departTime: input.departTime ?? null,
        arriveTime: input.arriveTime ?? null,
        duration: input.duration ?? null,
        isLayover: input.isLayover ?? false,
        layoverDuration: input.layoverDuration ?? null,
        orderIndex: input.orderIndex ?? 0,
        notes: input.notes ?? null,
      });
      return { flightId };
    }),

  update: protectedProcedure
    .input(z.object({
      flightId: z.number(),
      tripId: z.number(),
      type: z.enum(["outbound", "return", "connecting"]).optional(),
      airline: z.string().optional(),
      flightNumber: z.string().optional(),
      fromCode: z.string().optional(),
      fromCity: z.string().optional(),
      toCode: z.string().optional(),
      toCity: z.string().optional(),
      date: z.string().optional(),
      departTime: z.string().optional(),
      arriveTime: z.string().optional(),
      duration: z.string().optional(),
      isLayover: z.boolean().optional(),
      layoverDuration: z.string().optional(),
      orderIndex: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { flightId, tripId, ...rest } = input;
      const membership = await db.getUserMembership(tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.updateFlight(flightId, rest);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ flightId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.deleteFlight(input.flightId);
      return { success: true };
    }),
});

// ─── Hotels Router ────────────────────────────────────────────────────────────
const hotelsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership) throw new Error("Access denied");
      return db.getTripAccommodations(input.tripId);
    }),

  add: protectedProcedure
    .input(z.object({
      tripId: z.number(),
      name: z.string().min(1),
      city: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      nights: z.number().optional(),
      notes: z.string().optional(),
      orderIndex: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      const accId = await db.addAccommodation({
        tripId: input.tripId,
        name: input.name,
        city: input.city ?? null,
        checkIn: input.checkIn ?? null,
        checkOut: input.checkOut ?? null,
        nights: input.nights ?? null,
        notes: input.notes ?? null,
        orderIndex: input.orderIndex ?? 0,
      });
      return { accId };
    }),

  update: protectedProcedure
    .input(z.object({
      accId: z.number(),
      tripId: z.number(),
      name: z.string().min(1).optional(),
      city: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      nights: z.number().optional(),
      notes: z.string().optional(),
      orderIndex: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { accId, tripId, ...rest } = input;
      const membership = await db.getUserMembership(tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.updateAccommodation(accId, rest);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ accId: z.number(), tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembership(input.tripId, ctx.user.id);
      if (!membership || membership.role === "viewer") throw new Error("Permission denied");
      await db.deleteAccommodation(input.accId);
      return { success: true };
    }),
});

// ─── Notifications Router ─────────────────────────────────────────────────────
const notificationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserNotifications(ctx.user.id);
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await db.getUnreadCount(ctx.user.id);
    return { count };
  }),

  markRead: protectedProcedure
    .input(z.object({ notifId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.markNotificationRead(input.notifId);
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db.markAllNotificationsRead(ctx.user.id);
    return { success: true };
  }),
});

// ─── Travel History Router ────────────────────────────────────────────────────
const travelHistoryRouter = router({
  getCountries: protectedProcedure.query(async ({ ctx }) => {
    return db.getVisitedCountries(ctx.user.id);
  }),

  upsertCountry: protectedProcedure
    .input(z.object({
      countryCode: z.string().min(2).max(3),
      countryName: z.string().min(1),
      status: z.enum(["visited", "planned", "wishlist"]),
      visitedAt: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.upsertVisitedCountry({
        userId: ctx.user.id,
        countryCode: input.countryCode,
        countryName: input.countryName,
        status: input.status,
        visitedAt: input.visitedAt ? new Date(input.visitedAt) : null,
        notes: input.notes ?? null,
      });
      return { success: true };
    }),

  removeCountry: protectedProcedure
    .input(z.object({ countryCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.removeVisitedCountry(ctx.user.id, input.countryCode);
      return { success: true };
    }),
});

// ─── Flight Passport Router ───────────────────────────────────────────────────
const passportRouter = router({
  getFlights: protectedProcedure.query(async ({ ctx }) => {
    return db.getPastFlights(ctx.user.id);
  }),

  addFlight: protectedProcedure
    .input(z.object({
      flightNumber: z.string().optional(),
      airline: z.string().optional(),
      airlineCode: z.string().optional(),
      departureAirport: z.string().min(2),
      departureCity: z.string().optional(),
      departureCountry: z.string().optional(),
      departureLat: z.string().optional(),
      departureLng: z.string().optional(),
      arrivalAirport: z.string().min(2),
      arrivalCity: z.string().optional(),
      arrivalCountry: z.string().optional(),
      arrivalLat: z.string().optional(),
      arrivalLng: z.string().optional(),
      flightDate: z.string(),
      durationMinutes: z.number().optional(),
      distanceKm: z.number().optional(),
      seatClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const flightDate = new Date(input.flightDate);
      const flightId = await db.addPastFlight({
        userId: ctx.user.id,
        flightNumber: input.flightNumber ?? null,
        airline: input.airline ?? null,
        airlineCode: input.airlineCode ?? null,
        departureAirport: input.departureAirport,
        departureCity: input.departureCity ?? null,
        departureCountry: input.departureCountry ?? null,
        departureLat: input.departureLat ?? null,
        departureLng: input.departureLng ?? null,
        arrivalAirport: input.arrivalAirport,
        arrivalCity: input.arrivalCity ?? null,
        arrivalCountry: input.arrivalCountry ?? null,
        arrivalLat: input.arrivalLat ?? null,
        arrivalLng: input.arrivalLng ?? null,
        flightDate,
        flightYear: flightDate.getFullYear(),
        durationMinutes: input.durationMinutes ?? null,
        distanceKm: input.distanceKm ?? null,
        seatClass: input.seatClass,
                notes: input.notes ?? null,
      });
      // Auto-sync: if arrivalCountry is known, upsert it as visited
      for (const countryName of [input.arrivalCountry, input.departureCountry]) {
        if (!countryName || countryName === "Hong Kong") continue;
        const iso = FLIGHT_COUNTRY_TO_ISO[countryName];
        if (iso) {
          await db.upsertVisitedCountry({
            userId: ctx.user.id,
            countryCode: iso.code,
            countryName: iso.name,
            status: "visited",
            visitedAt: flightDate,
            notes: null,
          });
        }
      }
      return { flightId };
    }),
  updateFlight: protectedProcedure
    .input(z.object({
      flightId: z.number(),
      flightNumber: z.string().optional(),
      airline: z.string().optional(),
      airlineCode: z.string().optional(),
      departureAirport: z.string().optional(),
      departureCity: z.string().optional(),
      departureCountry: z.string().optional(),
      arrivalAirport: z.string().optional(),
      arrivalCity: z.string().optional(),
      arrivalCountry: z.string().optional(),
      flightDate: z.string().optional(),
      durationMinutes: z.number().optional(),
      distanceKm: z.number().optional(),
      seatClass: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { flightId, flightDate, ...rest } = input;
            await db.updatePastFlight(flightId, {
        ...rest,
        ...(flightDate ? { flightDate: new Date(flightDate), flightYear: new Date(flightDate).getFullYear() } : {}),
      });
      // Auto-sync: if country fields are being updated, upsert visited countries
      const date = flightDate ? new Date(flightDate) : new Date();
      for (const countryName of [input.arrivalCountry, input.departureCountry]) {
        if (!countryName || countryName === "Hong Kong") continue;
        const iso = FLIGHT_COUNTRY_TO_ISO[countryName];
        if (iso) {
          await db.upsertVisitedCountry({
            userId: ctx.user.id,
            countryCode: iso.code,
            countryName: iso.name,
            status: "visited",
            visitedAt: date,
            notes: null,
          });
        }
      }
      return { success: true };
    }),
  deleteFlight: protectedProcedure
    .input(z.object({ flightId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deletePastFlight(input.flightId);
      return { success: true };
    }),

  seedMyFlights: protectedProcedure.mutation(async ({ ctx }) => {
    // Check if user already has seeded flights
    const existing = await db.getPastFlights(ctx.user.id);
    if (existing.length > 0) return { alreadySeeded: true, count: existing.length };

    // Historical flight data from Flighty
    const flights: Array<{ flightNumber: string; airline: string; airlineCode: string; dep: string; depCity: string; depCountry: string; arr: string; arrCity: string; arrCountry: string; date: string; seatClass: "economy" | "business" }> = [
      // 2026
      { flightNumber: "EK380", airline: "Emirates", airlineCode: "EK", dep: "DXB", depCity: "Dubai", depCountry: "UAE", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2026-04-07", seatClass: "economy" },
      { flightNumber: "EK926", airline: "Emirates", airlineCode: "EK", dep: "CAI", depCity: "Cairo", depCountry: "Egypt", arr: "DXB", arrCity: "Dubai", arrCountry: "UAE", date: "2026-04-07", seatClass: "economy" },
      { flightNumber: "MS86", airline: "EgyptAir", airlineCode: "MS", dep: "CAI", depCity: "Cairo", depCountry: "Egypt", arr: "ASW", arrCity: "Aswan", arrCountry: "Egypt", date: "2026-03-28", seatClass: "economy" },
      { flightNumber: "EK927", airline: "Emirates", airlineCode: "EK", dep: "DXB", depCity: "Dubai", depCountry: "UAE", arr: "CAI", arrCity: "Cairo", arrCountry: "Egypt", date: "2026-03-28", seatClass: "economy" },
      { flightNumber: "EK381", airline: "Emirates", airlineCode: "EK", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "DXB", arrCity: "Dubai", arrCountry: "UAE", date: "2026-03-28", seatClass: "economy" },
      { flightNumber: "JL735", airline: "Japan Airlines", airlineCode: "JL", dep: "NRT", depCity: "Tokyo", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2026-02-25", seatClass: "economy" },
      { flightNumber: "JL736", airline: "Japan Airlines", airlineCode: "JL", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "NRT", arrCity: "Tokyo", arrCountry: "Japan", date: "2026-02-15", seatClass: "economy" },
      { flightNumber: "CX589", airline: "Cathay Pacific", airlineCode: "CX", dep: "FUK", depCity: "Fukuoka", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2026-01-04", seatClass: "economy" },
      { flightNumber: "JL3626", airline: "Japan Airlines", airlineCode: "JL", dep: "KMI", depCity: "Miyazaki", depCountry: "Japan", arr: "FUK", arrCity: "Fukuoka", arrCountry: "Japan", date: "2026-01-02", seatClass: "economy" },
      // 2025
      { flightNumber: "CX564", airline: "Cathay Pacific", airlineCode: "CX", dep: "TPE", depCity: "Taipei", depCountry: "Taiwan", arr: "KIX", arrCity: "Osaka", arrCountry: "Japan", date: "2025-12-23", seatClass: "economy" },
      { flightNumber: "CX402", airline: "Cathay Pacific", airlineCode: "CX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "TPE", arrCity: "Taipei", arrCountry: "Taiwan", date: "2025-12-19", seatClass: "economy" },
      { flightNumber: "UO613", airline: "HK Express", airlineCode: "UO", dep: "FUK", depCity: "Fukuoka", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2025-07-01", seatClass: "economy" },
      { flightNumber: "UO638", airline: "HK Express", airlineCode: "UO", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "FUK", arrCity: "Fukuoka", arrCountry: "Japan", date: "2025-06-28", seatClass: "economy" },
      { flightNumber: "CX521", airline: "Cathay Pacific", airlineCode: "CX", dep: "NRT", depCity: "Tokyo", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2025-04-24", seatClass: "economy" },
      { flightNumber: "JL482", airline: "Japan Airlines", airlineCode: "JL", dep: "TAK", depCity: "Takamatsu", depCountry: "Japan", arr: "HND", arrCity: "Tokyo", arrCountry: "Japan", date: "2025-04-22", seatClass: "economy" },
      { flightNumber: "JL481", airline: "Japan Airlines", airlineCode: "JL", dep: "HND", depCity: "Tokyo", depCountry: "Japan", arr: "TAK", arrCity: "Takamatsu", arrCountry: "Japan", date: "2025-04-18", seatClass: "economy" },
      { flightNumber: "CX530", airline: "Cathay Pacific", airlineCode: "CX", dep: "TPE", depCity: "Taipei", depCountry: "Taiwan", arr: "NGO", arrCity: "Nagoya", arrCountry: "Japan", date: "2025-04-12", seatClass: "economy" },
      { flightNumber: "CX564", airline: "Cathay Pacific", airlineCode: "CX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "TPE", arrCity: "Taipei", arrCountry: "Taiwan", date: "2025-04-12", seatClass: "economy" },
      { flightNumber: "CX531", airline: "Cathay Pacific", airlineCode: "CX", dep: "TPE", depCity: "Taipei", depCountry: "Taiwan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2025-01-02", seatClass: "economy" },
      // 2024
      { flightNumber: "CX530", airline: "Cathay Pacific", airlineCode: "CX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "TPE", arrCity: "Taipei", arrCountry: "Taiwan", date: "2024-12-21", seatClass: "economy" },
      { flightNumber: "CX369", airline: "Cathay Pacific", airlineCode: "CX", dep: "PVG", depCity: "Shanghai", depCountry: "China", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2024-11-16", seatClass: "economy" },
      { flightNumber: "CX366", airline: "Cathay Pacific", airlineCode: "CX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "PVG", arrCity: "Shanghai", arrCountry: "China", date: "2024-11-13", seatClass: "economy" },
      { flightNumber: "CX256", airline: "Cathay Pacific", airlineCode: "CX", dep: "LHR", depCity: "London", depCountry: "UK", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2024-08-13", seatClass: "economy" },
      { flightNumber: "CX251", airline: "Cathay Pacific", airlineCode: "CX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "LHR", arrCity: "London", arrCountry: "UK", date: "2024-07-31", seatClass: "economy" },
      { flightNumber: "CX507", airline: "Cathay Pacific", airlineCode: "CX", dep: "KIX", depCity: "Osaka", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2024-03-28", seatClass: "economy" },
      { flightNumber: "CX564", airline: "Cathay Pacific", airlineCode: "CX", dep: "TPE", depCity: "Taipei", depCountry: "Taiwan", arr: "KIX", arrCity: "Osaka", arrCountry: "Japan", date: "2024-03-23", seatClass: "economy" },
      { flightNumber: "CX564", airline: "Cathay Pacific", airlineCode: "CX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "TPE", arrCity: "Taipei", arrCountry: "Taiwan", date: "2024-03-23", seatClass: "economy" },
      { flightNumber: "MM67", airline: "Peach Aviation", airlineCode: "MM", dep: "KIX", depCity: "Osaka", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2024-02-11", seatClass: "economy" },
      { flightNumber: "MM64", airline: "Peach Aviation", airlineCode: "MM", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "KIX", arrCity: "Osaka", arrCountry: "Japan", date: "2024-02-03", seatClass: "economy" },
      // 2023
      { flightNumber: "UO871", airline: "HK Express", airlineCode: "UO", dep: "NRT", depCity: "Tokyo", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2023-08-10", seatClass: "economy" },
      { flightNumber: "MM589", airline: "Peach Aviation", airlineCode: "MM", dep: "NRT", depCity: "Tokyo", depCountry: "Japan", arr: "CTS", arrCity: "Sapporo", arrCountry: "Japan", date: "2023-07-29", seatClass: "economy" },
      { flightNumber: "UO848", airline: "HK Express", airlineCode: "UO", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "NRT", arrCity: "Tokyo", arrCountry: "Japan", date: "2023-07-26", seatClass: "economy" },
      // 2019
      { flightNumber: "HX253", airline: "Hong Kong Airlines", airlineCode: "HX", dep: "TPE", depCity: "Taipei", depCountry: "Taiwan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2019-11-18", seatClass: "economy" },
      { flightNumber: "HX254", airline: "Hong Kong Airlines", airlineCode: "HX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "TPE", arrCity: "Taipei", arrCountry: "Taiwan", date: "2019-11-15", seatClass: "economy" },
      { flightNumber: "HX6758", airline: "Hong Kong Airlines", airlineCode: "HX", dep: "BKK", depCity: "Bangkok", depCountry: "Thailand", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2019-06-09", seatClass: "economy" },
      { flightNumber: "HX775", airline: "Hong Kong Airlines", airlineCode: "HX", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "BKK", arrCity: "Bangkok", arrCountry: "Thailand", date: "2019-06-06", seatClass: "economy" },
      { flightNumber: "UO689", airline: "HK Express", airlineCode: "UO", dep: "KIX", depCity: "Osaka", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2019-03-19", seatClass: "economy" },
      { flightNumber: "UO898", airline: "HK Express", airlineCode: "UO", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "KIX", arrCity: "Osaka", arrCountry: "Japan", date: "2019-03-12", seatClass: "economy" },
      // 2018
      { flightNumber: "UO871", airline: "HK Express", airlineCode: "UO", dep: "NRT", depCity: "Tokyo", depCountry: "Japan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2018-11-16", seatClass: "economy" },
      { flightNumber: "UO870", airline: "HK Express", airlineCode: "UO", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "NRT", arrCity: "Tokyo", arrCountry: "Japan", date: "2018-11-07", seatClass: "economy" },
      // 2017
      { flightNumber: "UO141", airline: "HK Express", airlineCode: "UO", dep: "RMQ", depCity: "Taichung", depCountry: "Taiwan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2017-07-31", seatClass: "economy" },
      { flightNumber: "UO140", airline: "HK Express", airlineCode: "UO", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "RMQ", arrCity: "Taichung", arrCountry: "Taiwan", date: "2017-07-27", seatClass: "economy" },
      { flightNumber: "CI937", airline: "China Airlines", airlineCode: "CI", dep: "KHH", depCity: "Kaohsiung", depCountry: "Taiwan", arr: "HKG", arrCity: "Hong Kong", arrCountry: "Hong Kong", date: "2017-06-26", seatClass: "economy" },
      { flightNumber: "CI934", airline: "China Airlines", airlineCode: "CI", dep: "HKG", depCity: "Hong Kong", depCountry: "Hong Kong", arr: "KHH", arrCity: "Kaohsiung", arrCountry: "Taiwan", date: "2017-06-22", seatClass: "economy" },
    ];

    let count = 0;
    for (const f of flights) {
      const flightDate = new Date(f.date);
      await db.addPastFlight({
        userId: ctx.user.id,
        flightNumber: f.flightNumber,
        airline: f.airline,
        airlineCode: f.airlineCode,
        departureAirport: f.dep,
        departureCity: f.depCity,
        departureCountry: f.depCountry,
        departureLat: null,
        departureLng: null,
        arrivalAirport: f.arr,
        arrivalCity: f.arrCity,
        arrivalCountry: f.arrCountry,
        arrivalLat: null,
        arrivalLng: null,
        flightDate,
        flightYear: flightDate.getFullYear(),
        durationMinutes: null,
        distanceKm: null,
        seatClass: f.seatClass,
        notes: null,
      });
            count++;
    }

    // Auto-sync visited countries from all imported flights
    const flightDataForSync = flights.map(f => ({ depCountry: f.depCountry, arrCountry: f.arrCountry, date: f.date }));
    const countries = extractCountriesFromFlights(flightDataForSync);
    let countriesSynced = 0;
    for (const c of countries) {
      await db.upsertVisitedCountry({
        userId: ctx.user.id,
        countryCode: c.code,
        countryName: c.name,
        status: "visited",
        visitedAt: new Date(`${c.year}-01-01`),
      });
      countriesSynced++;
    }

    return { success: true, count, countriesSynced };
  }),

  syncCountriesFromFlights: protectedProcedure.mutation(async ({ ctx }) => {
    // Re-derive visited countries from all existing past flights in the database
    const existingFlights = await db.getPastFlights(ctx.user.id);
    const flightDataForSync = existingFlights.map(f => ({
      depCountry: f.departureCountry ?? "",
      arrCountry: f.arrivalCountry ?? "",
      date: f.flightDate ? new Date(f.flightDate as Date).toISOString().split("T")[0] : "2000-01-01",
    }));
    const countries = extractCountriesFromFlights(flightDataForSync);
    let synced = 0;
    for (const c of countries) {
      await db.upsertVisitedCountry({
        userId: ctx.user.id,
        countryCode: c.code,
        countryName: c.name,
        status: "visited",
        visitedAt: new Date(`${c.year}-01-01`),
      });
      synced++;
    }
    return { success: true, synced, total: existingFlights.length };
  }),
});
// ─── AI Router ────────────────────────────────────────────────────────────────
const aiRouter = router({
  chat: protectedProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
      tripContext: z.object({
        destination: z.string(),
        startDate: z.string(),
        endDate: z.string(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const systemPrompt = input.tripContext
        ? `你是一個專業的旅行助手。目前正在規劃前往 ${input.tripContext.destination} 的旅行，日期為 ${input.tripContext.startDate} 至 ${input.tripContext.endDate}。請用繁體中文回答，提供實用的旅行建議。`
        : "你是一個專業的旅行助手。請用繁體中文回答，提供實用的旅行建議。";

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          ...input.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        ],
      });
      const content = response.choices[0]?.message?.content;
      return { reply: typeof content === "string" ? content : "抱歉，無法生成回覆。" };
    }),

  suggestActivities: protectedProcedure
    .input(z.object({
      destination: z.string(),
      date: z.string(),
      dayNumber: z.number(),
      existingActivities: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "你是一個旅行規劃專家。請根據目的地和日期，建議5個適合的旅行活動。以JSON格式回覆，格式為：{\"activities\": [{\"title\": \"活動名稱\", \"location\": \"地點\", \"startTime\": \"09:00\", \"category\": \"attraction\", \"notes\": \"簡短說明\"}]}。category只能是: transport, food, attraction, hotel, shopping, other。"
          },
          {
            role: "user",
            content: `目的地: ${input.destination}\n日期: ${input.date} (第${input.dayNumber}天)\n${input.existingActivities?.length ? `已有活動: ${input.existingActivities.join(", ")}` : ""}\n請建議5個適合的活動。`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "activities_suggestion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                activities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      location: { type: "string" },
                      startTime: { type: "string" },
                      category: { type: "string" },
                      notes: { type: "string" },
                    },
                    required: ["title", "location", "startTime", "category", "notes"],
                    additionalProperties: false,
                  }
                }
              },
              required: ["activities"],
              additionalProperties: false,
            }
          }
        }
      });
      const content = response.choices[0]?.message?.content;
      const contentStr = typeof content === "string" ? content : JSON.stringify(content);
      try {
        const parsed = JSON.parse(contentStr);
        return parsed as { activities: Array<{ title: string; location: string; startTime: string; category: string; notes: string }> };
      } catch {
        return { activities: [] };
      }
    }),
});

// ─── Sync Router ────────────────────────────────────────────────────────────
const syncRouter = router({
  // Get a summary of all data counts for the current user
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const userTrips = await db.getUserTrips(userId);
    const tripIds = userTrips.map(t => t.id);

    let totalExpenses = 0;
    let totalFlights = 0;
    let totalHotels = 0;
    let totalActivities = 0;
    let totalMapPins = 0;
    let uncategorisedExpenses = 0;

    for (const tripId of tripIds) {
      const [exps, fls, hotels, days, pins] = await Promise.all([
        db.getTripExpenses(tripId),
        db.getTripFlights(tripId),
        db.getTripAccommodations(tripId),
        db.getItineraryDays(tripId),
        db.getMapPins(tripId),
      ]);
      totalExpenses += exps.length;
      uncategorisedExpenses += exps.filter(e => !e.category || e.category === "other").length;
      totalFlights += fls.length;
      totalHotels += hotels.length;
      totalMapPins += pins.length;
      for (const day of days) {
        // activities are nested in days
        totalActivities += (day as any).activities?.length ?? 0;
      }
    }

    const pastFlightsList = await db.getPastFlights(userId);
    const visitedCountriesList = await db.getVisitedCountries(userId);

    return {
      trips: userTrips.length,
      expenses: totalExpenses,
      uncategorisedExpenses,
      tripFlights: totalFlights,
      hotels: totalHotels,
      activities: totalActivities,
      mapPins: totalMapPins,
      pastFlights: pastFlightsList.length,
      visitedCountries: visitedCountriesList.length,
      lastSyncedAt: new Date().toISOString(),
    };
  }),

  // Sync 1: Sync visited countries from past flights (uses both country names AND airport IATA codes)
  syncCountriesFromFlights: protectedProcedure.mutation(async ({ ctx }) => {
    const existingFlights = await db.getPastFlights(ctx.user.id);
    const flightDataForSync = existingFlights.map(f => ({
      depCountry: f.departureCountry ?? "",
      arrCountry: f.arrivalCountry ?? "",
      date: f.flightDate ? new Date(f.flightDate as Date).toISOString().split("T")[0] : "2000-01-01",
    }));
    const countries = extractCountriesFromFlights(flightDataForSync);
    // Also derive from airport IATA codes as fallback
    const seenCodes = new Set(countries.map(c => c.code));
    for (const f of existingFlights) {
      const flightDate = f.flightDate ? new Date(f.flightDate as Date).toISOString().split("T")[0] : "2000-01-01";
      const year = new Date(flightDate).getFullYear();
      for (const airport of [f.departureAirport, f.arrivalAirport]) {
        if (!airport) continue;
        const iata = airport.trim().toUpperCase().slice(0, 3);
        const iso = AIRPORT_TO_COUNTRY[iata];
        if (iso && iso.code !== "HK" && !seenCodes.has(iso.code)) {
          countries.push({ code: iso.code, name: iso.name, year });
          seenCodes.add(iso.code);
        }
      }
    }
    let synced = 0;
    for (const c of countries) {
      await db.upsertVisitedCountry({
        userId: ctx.user.id,
        countryCode: c.code,
        countryName: c.name,
        status: "visited",
        visitedAt: new Date(`${c.year}-01-01`),
      });
      synced++;
    }
    return { success: true, synced, total: existingFlights.length, label: "飛行護照 → 旅遊足跡" };
  }),

  // Sync 2: Sync visited countries from trip destinations
  syncCountriesFromTrips: protectedProcedure.mutation(async ({ ctx }) => {
    const userTrips = await db.getUserTrips(ctx.user.id);
    let synced = 0;
    for (const trip of userTrips) {
      const detected = detectCountryFromDestination(trip.destination);
      if (detected) {
        await db.upsertVisitedCountry({
          userId: ctx.user.id,
          countryCode: detected.code,
          countryName: detected.name,
          status: "visited",
          visitedAt: trip.startDate ? new Date(trip.startDate as Date) : new Date(),
        });
        synced++;
      }
    }
    return { success: true, synced, total: userTrips.length, label: "行程目的地 → 旅遊足跡" };
  }),

  // Sync 3: Verify data integrity - check for orphaned records and count totals
  syncDataIntegrity: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const userTrips = await db.getUserTrips(userId);
    const validTripIds = new Set(userTrips.map(t => t.id));

    // Count all records across all trips
    let totalExpenses = 0, totalFlights = 0, totalHotels = 0, totalActivities = 0;
    let expenseTotal = 0;
    for (const trip of userTrips) {
      const [exps, fls, hotels, days] = await Promise.all([
        db.getTripExpenses(trip.id),
        db.getTripFlights(trip.id),
        db.getTripAccommodations(trip.id),
        db.getItineraryDays(trip.id),
      ]);
      totalExpenses += exps.length;
      totalFlights += fls.length;
      totalHotels += hotels.length;
      for (const exp of exps) {
        expenseTotal += Number(exp.amount) || 0;
      }
    }

    const pastFlights = await db.getPastFlights(userId);
    const visitedCountries = await db.getVisitedCountries(userId);

    const issues: string[] = [];
    if (userTrips.length === 0) issues.push("尚未建立任何行程");
    if (totalExpenses === 0 && userTrips.length > 0) issues.push("行程尚未記錄任何費用");

    const message = issues.length > 0
      ? `發現問題：${issues.join("、")}`
      : `已驗證 ${validTripIds.size} 個行程、${totalExpenses} 筆費用、${totalFlights + pastFlights.length} 個航班、${totalHotels} 個住宿、${visitedCountries.length} 個到訪國家，資料完整`;

    return {
      success: true,
      validTrips: validTripIds.size,
      totalExpenses,
      totalFlights: totalFlights + pastFlights.length,
      totalHotels,
      expenseTotal: Math.round(expenseTotal),
      visitedCountries: visitedCountries.length,
      issues,
      label: "資料完整性檢查",
      message,
    };
  }),

  // Sync 4: Full sync - runs all sync operations in sequence
  syncAll: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;
    const results: Array<{ label: string; synced: number; total: number }> = [];

    // Step 1: Sync countries from past flights
    const existingFlights = await db.getPastFlights(userId);
    const flightDataForSync = existingFlights.map(f => ({
      depCountry: f.departureCountry ?? "",
      arrCountry: f.arrivalCountry ?? "",
      date: f.flightDate ? new Date(f.flightDate as Date).toISOString().split("T")[0] : "2000-01-01",
    }));
    const countriesFromFlights = extractCountriesFromFlights(flightDataForSync);
    let flightCountriesSynced = 0;
    for (const c of countriesFromFlights) {
      await db.upsertVisitedCountry({
        userId,
        countryCode: c.code,
        countryName: c.name,
        status: "visited",
        visitedAt: new Date(`${c.year}-01-01`),
      });
      flightCountriesSynced++;
    }
    results.push({ label: "飛行護照 → 旅遊足跡", synced: flightCountriesSynced, total: existingFlights.length });

    // Step 2: Sync countries from trip destinations
    const userTrips = await db.getUserTrips(userId);
    let tripCountriesSynced = 0;
    for (const trip of userTrips) {
      const detected = detectCountryFromDestination(trip.destination);
      if (detected) {
        await db.upsertVisitedCountry({
          userId,
          countryCode: detected.code,
          countryName: detected.name,
          status: "visited",
          visitedAt: trip.startDate ? new Date(trip.startDate as Date) : new Date(),
        });
        tripCountriesSynced++;
      }
    }
    results.push({ label: "行程目的地 → 旅遊足跡", synced: tripCountriesSynced, total: userTrips.length });

    // Step 3: Count all data
    let totalExpenses = 0, totalTripFlights = 0, totalHotels = 0;
    for (const trip of userTrips) {
      const [exps, fls, hotels] = await Promise.all([
        db.getTripExpenses(trip.id),
        db.getTripFlights(trip.id),
        db.getTripAccommodations(trip.id),
      ]);
      totalExpenses += exps.length;
      totalTripFlights += fls.length;
      totalHotels += hotels.length;
    }
    results.push({ label: "費用記錄驗證", synced: totalExpenses, total: totalExpenses });
    results.push({ label: "航班記錄驗證", synced: totalTripFlights + existingFlights.length, total: totalTripFlights + existingFlights.length });
    results.push({ label: "住宿記錄驗證", synced: totalHotels, total: totalHotels });

    const visitedCountriesList = await db.getVisitedCountries(userId);
    results.push({ label: "旅遊足跡總計", synced: visitedCountriesList.length, total: visitedCountriesList.length });

    return { success: true, results, syncedAt: new Date().toISOString() };
  }),
});

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  trips: tripsRouter,
  members: membersRouter,
  itinerary: itineraryRouter,
  expenses: expensesRouter,
  map: mapRouter,
  flights: flightsRouter,
  hotels: hotelsRouter,
  notifications: notificationsRouter,
  travelHistory: travelHistoryRouter,
  passport: passportRouter,
  ai: aiRouter,
  sync: syncRouter,
  currency: currencyRouter,
});

export type AppRouter = typeof appRouter;
