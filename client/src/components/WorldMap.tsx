import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3-geo";
import * as topojson from "topojson-client";


// ISO numeric → ISO alpha-2 mapping for the countries we care about
// (world-atlas uses numeric IDs)
const NUMERIC_TO_ALPHA2: Record<string, string> = {
  "004": "AF", "008": "AL", "012": "DZ", "024": "AO", "032": "AR", "036": "AU",
  "040": "AT", "050": "BD", "056": "BE", "068": "BO", "076": "BR", "100": "BG",
  "116": "KH", "120": "CM", "124": "CA", "152": "CL", "156": "CN", "170": "CO",
  "188": "CR", "191": "HR", "192": "CU", "196": "CY", "203": "CZ", "208": "DK",
  "218": "EC", "818": "EG", "231": "ET", "246": "FI", "250": "FR", "276": "DE",
  "288": "GH", "300": "GR", "320": "GT", "332": "HT", "340": "HN", "348": "HU",
  "356": "IN", "360": "ID", "364": "IR", "368": "IQ", "372": "IE", "376": "IL",
  "380": "IT", "388": "JM", "392": "JP", "400": "JO", "398": "KZ", "404": "KE",
  "410": "KR", "414": "KW", "418": "LA", "422": "LB", "434": "LY", "484": "MX",
  "504": "MA", "458": "MY", "466": "ML", "496": "MN", "516": "NA", "524": "NP",
  "528": "NL", "554": "NZ", "566": "NG", "578": "NO", "586": "PK", "591": "PA",
  "604": "PE", "608": "PH", "616": "PL", "620": "PT", "630": "PR", "634": "QA",
  "642": "RO", "643": "RU", "682": "SA", "686": "SN", "694": "SL", "706": "SO",
  "710": "ZA", "724": "ES", "144": "LK", "729": "SD", "752": "SE", "756": "CH",
  "760": "SY", "158": "TW", "764": "TH", "788": "TN", "792": "TR", "800": "UG",
  "804": "UA", "784": "AE", "826": "GB", "840": "US", "858": "UY", "860": "UZ",
  "704": "VN", "887": "YE", "894": "ZM", "716": "ZW", "344": "HK", "446": "MO",
  "702": "SG",   "064": "BT", "090": "SB", "598": "PG",
};

// Country name lookup (alpha-2 → display name)
const COUNTRY_NAMES: Record<string, string> = {
  AF: "阿富汗", AL: "阿爾巴尼亞", DZ: "阿爾及利亞", AO: "安哥拉", AR: "阿根廷",
  AU: "澳大利亞", AT: "奧地利", BD: "孟加拉", BE: "比利時", BO: "玻利維亞",
  BR: "巴西", BG: "保加利亞", KH: "柬埔寨", CM: "喀麥隆", CA: "加拿大",
  CL: "智利", CN: "中國", CO: "哥倫比亞", CR: "哥斯達黎加", HR: "克羅地亞",
  CU: "古巴", CY: "塞浦路斯", CZ: "捷克", DK: "丹麥", EC: "厄瓜多爾",
  EG: "埃及", ET: "埃塞俄比亞", FI: "芬蘭", FR: "法國", DE: "德國",
  GH: "加納", GR: "希臘", GT: "危地馬拉", HT: "海地", HN: "洪都拉斯",
  HU: "匈牙利", IN: "印度", ID: "印度尼西亞", IR: "伊朗", IQ: "伊拉克",
  IE: "愛爾蘭", IL: "以色列", IT: "意大利", JM: "牙買加", JP: "日本",
  JO: "約旦", KZ: "哈薩克斯坦", KE: "肯尼亞", KR: "韓國", KW: "科威特",
  LA: "老撾", LB: "黎巴嫩", LY: "利比亞", MX: "墨西哥", MA: "摩洛哥",
  MY: "馬來西亞", ML: "馬里", MN: "蒙古", NA: "納米比亞", NP: "尼泊爾",
  NL: "荷蘭", NZ: "新西蘭", NG: "尼日利亞", NO: "挪威", PK: "巴基斯坦",
  PA: "巴拿馬", PE: "秘魯", PH: "菲律賓", PL: "波蘭", PT: "葡萄牙",
  QA: "卡塔爾", RO: "羅馬尼亞", RU: "俄羅斯", SA: "沙特阿拉伯", SN: "塞內加爾",
  ZA: "南非", ES: "西班牙", LK: "斯里蘭卡", SD: "蘇丹", SE: "瑞典",
  CH: "瑞士", SY: "敘利亞", TW: "台灣", TH: "泰國", TN: "突尼斯",
  TR: "土耳其", UG: "烏干達", UA: "烏克蘭", AE: "阿聯酋", GB: "英國",
  US: "美國", UY: "烏拉圭", UZ: "烏茲別克斯坦", VN: "越南", YE: "也門",
  ZM: "贊比亞", ZW: "津巴布韋", HK: "香港", MO: "澳門", SG: "新加坡",
};

type CountryStatus = "visited" | "planned" | "wishlist";

interface WorldMapProps {
  visitedCountries: Array<{ countryCode: string; status: CountryStatus }>;
  onCountryClick?: (code: string, name: string) => void;
  className?: string;
}

const STATUS_COLORS: Record<CountryStatus, string> = {
  visited: "#22c55e",
  planned: "#3b82f6",
  wishlist: "#f59e0b",
};

const STATUS_LABELS: Record<CountryStatus, string> = {
  visited: "已到訪",
  planned: "計劃中",
  wishlist: "心願清單",
};

export default function WorldMap({ visitedCountries, onCountryClick, className = "" }: WorldMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; status?: CountryStatus } | null>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Build lookup map from alpha-2 code → status
  const statusMap = new Map<string, CountryStatus>(
    visitedCountries.map(c => [c.countryCode.toUpperCase(), c.status])
  );

  // Load TopoJSON
  useEffect(() => {
    fetch("/manus-storage/countries-110m_2649362d.json")
      .then(r => r.json())
      .then(data => setGeoData(data))
      .catch(console.error);
  }, []);

  const getCountryFill = useCallback((numericId: string) => {
    const alpha2 = NUMERIC_TO_ALPHA2[numericId.padStart(3, "0")];
    if (!alpha2) return null;
    return statusMap.get(alpha2) ?? null;
  }, [statusMap]);

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.85 : 1.18;
    setTransform(t => ({
      ...t,
      scale: Math.min(Math.max(t.scale * delta, 1), 8),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTransform(t => ({ ...t, x: dragStart.current.tx + dx, y: dragStart.current.ty + dy }));
  }, []);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  const handleReset = () => setTransform({ x: 0, y: 0, scale: 1 });

  if (!geoData) {
    return (
      <div className={`flex items-center justify-center bg-muted/30 rounded-2xl ${className}`} style={{ minHeight: 280 }}>
        <div className="text-center text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm">載入地圖中...</p>
        </div>
      </div>
    );
  }

  const WIDTH = 960;
  const HEIGHT = 500;
  const projection = d3.geoNaturalEarth1().scale(153).translate([WIDTH / 2, HEIGHT / 2]);
  const pathGen = d3.geoPath().projection(projection);

  const countries = (topojson.feature(geoData, geoData.objects.countries) as any).features as any[];
  const borders = topojson.mesh(geoData, geoData.objects.countries, (a: any, b: any) => a !== b);

  return (
    <div className={`relative select-none ${className}`}>
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <button
          onClick={() => setTransform(t => ({ ...t, scale: Math.min(t.scale * 1.3, 8) }))}
          className="w-8 h-8 rounded-lg bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-accent transition-colors text-lg font-bold"
        >+</button>
        <button
          onClick={() => setTransform(t => ({ ...t, scale: Math.max(t.scale * 0.77, 1) }))}
          className="w-8 h-8 rounded-lg bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-accent transition-colors text-lg font-bold"
        >−</button>
        <button
          onClick={handleReset}
          className="w-8 h-8 rounded-lg bg-background/90 border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-accent transition-colors text-xs"
          title="重置視圖"
        >⊙</button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full rounded-2xl"
        style={{ background: "oklch(0.22 0.02 240)", cursor: isDragging.current ? "grabbing" : "grab", touchAction: "none" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Ocean */}
        <rect width={WIDTH} height={HEIGHT} fill="oklch(0.22 0.02 240)" />

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}
           style={{ transformOrigin: `${WIDTH / 2}px ${HEIGHT / 2}px` }}>
          {/* Country fills */}
          {countries.map((feature: any) => {
            const numId = String(feature.id ?? "");
            const status = getCountryFill(numId);
            const fill = status ? STATUS_COLORS[status] : "oklch(0.35 0.02 240)";
            const alpha2 = NUMERIC_TO_ALPHA2[numId.padStart(3, "0")] ?? "";
            const name = COUNTRY_NAMES[alpha2] ?? alpha2;
            return (
              <path
                key={feature.id}
                d={pathGen(feature) ?? ""}
                fill={fill}
                fillOpacity={status ? 0.85 : 1}
                stroke="oklch(0.28 0.02 240)"
                strokeWidth={0.5 / transform.scale}
                style={{ transition: "fill 0.2s" }}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = svgRef.current!.getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top - 10,
                    name,
                    status: status ?? undefined,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onCountryClick?.(alpha2, name)}
              />
            );
          })}

          {/* Country borders */}
          <path
            d={pathGen(borders as any) ?? ""}
            fill="none"
            stroke="oklch(0.28 0.02 240)"
            strokeWidth={0.5 / transform.scale}
          />
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 px-3 py-1.5 rounded-lg bg-popover border border-border shadow-lg text-sm font-medium text-popover-foreground"
          style={{ left: tooltip.x + 10, top: tooltip.y - 10, transform: "translateY(-100%)" }}
        >
          {tooltip.name}
          {tooltip.status && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold"
              style={{ background: STATUS_COLORS[tooltip.status] + "33", color: STATUS_COLORS[tooltip.status] }}
            >
              {STATUS_LABELS[tooltip.status]}
            </span>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-background/90 border border-border rounded-xl px-3 py-2 shadow-sm">
        {(Object.entries(STATUS_LABELS) as [CountryStatus, string][]).map(([status, label]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: STATUS_COLORS[status] }} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
