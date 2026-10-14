import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/useI18n";

export const TRIP_CURRENCIES = ["HKD", "USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD", "SGD", "TWD", "KRW", "THB", "EGP"];

export const TRIP_COVER_IMAGES = [
  "https://images.unsplash.com/photo-1568322445389-f64ac2515020?w=800&q=70",
  "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=800&q=70",
  "https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=800&q=70",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=70",
  "https://images.unsplash.com/photo-1500835556837-99ac94a94552?w=800&q=70",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=70",
];

export type TripFormValues = {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  baseCurrency: string;
  coverImage: string;
  description: string;
};

export const EMPTY_TRIP_FORM: TripFormValues = {
  name: "",
  destination: "",
  startDate: "",
  endDate: "",
  baseCurrency: "HKD",
  coverImage: "",
  description: "",
};

type TripFormProps = {
  value: TripFormValues;
  onChange: (value: TripFormValues) => void;
  idPrefix: string;
  disabled?: boolean;
};

/** Shared create/edit form: one validation/data shape across dashboard and trip settings. */
export default function TripForm({ value, onChange, idPrefix, disabled }: TripFormProps) {
  const { t } = useI18n();
  const update = <K extends keyof TripFormValues>(key: K, next: TripFormValues[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="space-y-4 mt-2">
      <div>
        <Label htmlFor={`${idPrefix}-name`}>{t("tripNameLabel")} *</Label>
        <Input id={`${idPrefix}-name`} required disabled={disabled} className="mt-1.5" placeholder={t("tripNamePlaceholder")} value={value.name} onChange={event => update("name", event.target.value)} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-destination`}>{t("destination")} *</Label>
        <Input id={`${idPrefix}-destination`} required disabled={disabled} className="mt-1.5" placeholder={t("destinationPlaceholder")} value={value.destination} onChange={event => update("destination", event.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-start`}>{t("startDate")} *</Label>
          <Input id={`${idPrefix}-start`} required disabled={disabled} className="mt-1.5" type="date" value={value.startDate} onChange={event => update("startDate", event.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-end`}>{t("endDate")} *</Label>
          <Input id={`${idPrefix}-end`} required disabled={disabled} className="mt-1.5" type="date" min={value.startDate || undefined} value={value.endDate} onChange={event => update("endDate", event.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-currency`}>{t("baseCurrency")}</Label>
        <Select disabled={disabled} value={value.baseCurrency} onValueChange={next => update("baseCurrency", next)}>
          <SelectTrigger id={`${idPrefix}-currency`} className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>{TRIP_CURRENCIES.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-description`}>{t("description")}</Label>
        <Textarea id={`${idPrefix}-description`} disabled={disabled} className="mt-1.5" placeholder={t("descriptionPlaceholder")} value={value.description} onChange={event => update("description", event.target.value)} rows={3} />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-cover-url`}>{t("coverImageUrl")}</Label>
        <Input id={`${idPrefix}-cover-url`} disabled={disabled} className="mt-1.5" placeholder={t("tripCoverPlaceholder")} value={value.coverImage} onChange={event => update("coverImage", event.target.value)} />
      </div>
      <div>
        <Label>{t("coverImage")}</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
          {TRIP_COVER_IMAGES.map(image => (
            <button key={image} type="button" disabled={disabled} onClick={() => update("coverImage", image)} aria-label={t("coverImage")}
              className={`relative h-20 rounded-lg overflow-hidden border-2 transition-all ${value.coverImage === image ? "border-primary" : "border-transparent hover:border-primary/40"}`}>
              <img src={image} alt="" className="w-full h-full object-cover" />
              {value.coverImage === image && <span className="absolute inset-0 bg-primary/20 grid place-items-center text-white text-lg">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
