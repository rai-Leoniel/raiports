'use client';

import { useState, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';

import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// Searchable Customers picker, matching SupplierPickerModal's search/select
// UX. Desktop's real "Customer List" screen also has Update/Import Excel/
// Deactivate/Print List actions plus a "Switch to Advance Version" toggle
// — those still aren't built here, same honest "not built yet" gap as
// before. Only Add New is now real.
//
// SHARED COMPONENT — used by both the Disbursement Voucher entry form's
// "Add Item" Customer tab AND the Sales module's "New sales order" ->
// Customer picker. CustomerOption below was widened (address/phone/email/
// active added, all optional) specifically so Sales can render its order
// entry header without a second round-trip — DV only ever reads .value/
// .label off this, so the extra fields are a no-op there.
//
// Add New — FIRST PASS ONLY. rssys.m06 is a 100+ column shared master
// table used across Customer/Prospect/Employee/Financer/Insurance/Bank
// `type` values, and clearly does double duty for loan-applicant data
// (SSS, Pag-IBIG, civil status, co-maker info) — none of that applies to
// a Customer record and is intentionally left out here. Type dropdown
// IS included (Prospect/Customer/Insurance/Financer/Shipping/Employee/
// Bank, confirmed via desktop screenshot), defaulting to 'Customer'
// since that's the context this modal is normally opened from, but the
// field is real and user-selectable, not hardcoded. Also NOT included
// yet: multiple addresses (this form only writes one primary address to
// rssys.m06_address) and the linked-account grid (rssys.m06_at —
// confirmed this session as the real "Lir/Code/Account Name/Main"
// sub-grid from the desktop's Customer Information screen). Both
// deferred to a follow-up, same pattern as Account Titles' "Linked to
// Previous Codes".
//
// Birthdate/Remarks/Block — confirmed real columns on rssys.m06 this
// session (bdate date, remarks text, isblock boolean). bdate is bound
// here, NOT com_m_bdate (that's the co-maker's birthdate, a loan-
// applicant field intentionally excluded like the rest of the co-maker
// block). Block's audit trail (blockedby/blockeddate/blockedtime) is
// NOT exposed as user input — same pattern as createdby/updatedby,
// it's meant to be stamped server-side (current user + now()) whenever
// isblock flips, so the backend should set those three columns itself
// when it sees isblock change on create-customer/update-customer, not
// trust values from this form. Block checkbox is disabled on Add New
// since you can't block a customer that doesn't exist yet — only
// editable from Update.
//
// Backend endpoints:
//   GET  /approval/reports/customers/        -> List_Customers (rssys.m06 WHERE type='Customer')
//   GET  /approval/reports/branches/          -> List_Branches (rssys.branch)
//   GET  /approval/reports/payment-terms/     -> List_Payment_Terms (rssys.m10 — same table Suppliers use)
//   GET  /approval/reports/discount-codes/    -> List_Discount_Codes (rssys.disctbl)
//   POST /approval/create-customer/           -> Create_Customer (rssys.m06 + rssys.m06_address)
//
// Price Type options hardcoded from the desktop screenshot (Wholesale /
// Retail / Special) — no dedicated lookup table found for this one,
// unlike Mode of Payment and Discount which are real rssys tables.

// WIDENED — was { value, label } only. Sales needs address/phone/email/
// active to populate its order entry header without a second fetch.
// All new fields are optional so DV's existing onSelect callers (which
// only destructure .value/.label) keep compiling and behaving exactly
// as before with zero changes required on their end.
export type CustomerOption = {
  value: string;
  label: string;
  address?: string;
  phone?: string;
  email?: string;
  active?: boolean;
};

type CustomerRow = {
  value: string;
  label: string;
  active?: boolean;
  phone?: string;
  email?: string;
  address?: string;
};

// Rows the person picks from a parsed CSV/XLSX file for Import — kept
// separate from CustomerFormData since only a subset of fields makes
// sense to expect in a spreadsheet (no address/linked-account columns).
type ImportRow = {
  type: string;
  is_company: boolean;
  last_name: string;
  first_name: string;
  mid_name: string;
  company_name: string;
  price_type: string;
  tin: string;
  phone: string;
  contact_name: string;
  contact_no: string;
  email: string;
  credit_limit: string;
};

type ImportResultRow = {
  row: number;
  name: string;
  status: 'success' | 'error';
  code?: string;
  message?: string;
};

// Confirmed real from the desktop's Add New screen (screenshot) — rssys.m06
// is shared across all seven of these, `type` is a real selectable field,
// not something specific to Customer despite this modal being reached
// from the DV entry form's "Customer" tab.
const CUSTOMER_TYPES = [
  { value: 'Prospect', label: 'Prospect' },
  { value: 'Customer', label: 'Customer' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Financer', label: 'Financer' },
  { value: 'Shipping', label: 'Shipping' },
  { value: 'Employee', label: 'Employee' },
  { value: 'Bank', label: 'Bank' },
];

// price_type is rssys.m06.price_type, confirmed varchar(1) — a single
// character, not the full word. Confirmed via live data: every existing
// row using this field stores 'R' for Retail (14/14 sample rows). W and
// S (Wholesale/Special) follow the same first-letter pattern but aren't
// directly confirmed in live data since no existing customer has them
// set — flagging as inferred, not verified, in case the desktop turns
// out to use different letters for those two.
const PRICE_TYPES = [
  { value: 'W', label: 'Wholesale' },
  { value: 'R', label: 'Retail' },
  { value: 'S', label: 'Special' },
];

type BranchOption = { value: string; label: string };
type LookupOption = { value: string; label: string };

// Confirmed real from the desktop's Customer Address popup (screenshot)
// — Type is a fixed 4-option dropdown, NOT free text as first built.
const ADDRESS_TYPES = [
  { value: 'Current Residence', label: 'Current Residence' },
  { value: 'Residence', label: 'Residence' },
  { value: 'Provincial Address', label: 'Provincial Address' },
  { value: 'Rent', label: 'Rent' },
];

// Country — maps to rssys.m06_address.cntry_code, CONFIRMED varchar(3)
// this session (previous version of this list wrongly sent the full
// country name as the value, e.g. "PHILIPPINES", which overflowed the
// column and caused a "value too long for type character varying(3)"
// save error). No existing m06_address row has cntry_code populated
// (0 rows found), so there's no live convention to match — using
// standard ISO 3166-1 alpha-3 codes as the value here, which is the
// conventional width/format for a 3-char country code column. Full
// country name is kept as the display label. If this ever turns out
// to not match what the desktop app itself writes, revisit.
const COUNTRIES = [
  { value: 'PHL', label: 'Philippines' },
  { value: 'AFG', label: 'Afghanistan' },
  { value: 'ALB', label: 'Albania' },
  { value: 'DZA', label: 'Algeria' },
  { value: 'AND', label: 'Andorra' },
  { value: 'AGO', label: 'Angola' },
  { value: 'ATG', label: 'Antigua and Barbuda' },
  { value: 'ARG', label: 'Argentina' },
  { value: 'ARM', label: 'Armenia' },
  { value: 'AUS', label: 'Australia' },
  { value: 'AUT', label: 'Austria' },
  { value: 'AZE', label: 'Azerbaijan' },
  { value: 'BHS', label: 'Bahamas' },
  { value: 'BHR', label: 'Bahrain' },
  { value: 'BGD', label: 'Bangladesh' },
  { value: 'BRB', label: 'Barbados' },
  { value: 'BLR', label: 'Belarus' },
  { value: 'BEL', label: 'Belgium' },
  { value: 'BLZ', label: 'Belize' },
  { value: 'BEN', label: 'Benin' },
  { value: 'BTN', label: 'Bhutan' },
  { value: 'BOL', label: 'Bolivia' },
  { value: 'BIH', label: 'Bosnia and Herzegovina' },
  { value: 'BWA', label: 'Botswana' },
  { value: 'BRA', label: 'Brazil' },
  { value: 'BRN', label: 'Brunei' },
  { value: 'BGR', label: 'Bulgaria' },
  { value: 'BFA', label: 'Burkina Faso' },
  { value: 'BDI', label: 'Burundi' },
  { value: 'CPV', label: 'Cabo Verde' },
  { value: 'KHM', label: 'Cambodia' },
  { value: 'CMR', label: 'Cameroon' },
  { value: 'CAN', label: 'Canada' },
  { value: 'CAF', label: 'Central African Republic' },
  { value: 'TCD', label: 'Chad' },
  { value: 'CHL', label: 'Chile' },
  { value: 'CHN', label: 'China' },
  { value: 'COL', label: 'Colombia' },
  { value: 'COM', label: 'Comoros' },
  { value: 'COG', label: 'Congo' },
  { value: 'CRI', label: 'Costa Rica' },
  { value: 'HRV', label: 'Croatia' },
  { value: 'CUB', label: 'Cuba' },
  { value: 'CYP', label: 'Cyprus' },
  { value: 'CZE', label: 'Czechia' },
  { value: 'COD', label: 'Democratic Republic of the Congo' },
  { value: 'DNK', label: 'Denmark' },
  { value: 'DJI', label: 'Djibouti' },
  { value: 'DMA', label: 'Dominica' },
  { value: 'DOM', label: 'Dominican Republic' },
  { value: 'ECU', label: 'Ecuador' },
  { value: 'EGY', label: 'Egypt' },
  { value: 'SLV', label: 'El Salvador' },
  { value: 'GNQ', label: 'Equatorial Guinea' },
  { value: 'ERI', label: 'Eritrea' },
  { value: 'EST', label: 'Estonia' },
  { value: 'SWZ', label: 'Eswatini' },
  { value: 'ETH', label: 'Ethiopia' },
  { value: 'FJI', label: 'Fiji' },
  { value: 'FIN', label: 'Finland' },
  { value: 'FRA', label: 'France' },
  { value: 'GAB', label: 'Gabon' },
  { value: 'GMB', label: 'Gambia' },
  { value: 'GEO', label: 'Georgia' },
  { value: 'DEU', label: 'Germany' },
  { value: 'GHA', label: 'Ghana' },
  { value: 'GRC', label: 'Greece' },
  { value: 'GRD', label: 'Grenada' },
  { value: 'GTM', label: 'Guatemala' },
  { value: 'GIN', label: 'Guinea' },
  { value: 'GNB', label: 'Guinea-Bissau' },
  { value: 'GUY', label: 'Guyana' },
  { value: 'HTI', label: 'Haiti' },
  { value: 'HND', label: 'Honduras' },
  { value: 'HKG', label: 'Hong Kong' },
  { value: 'HUN', label: 'Hungary' },
  { value: 'ISL', label: 'Iceland' },
  { value: 'IND', label: 'India' },
  { value: 'IDN', label: 'Indonesia' },
  { value: 'IRN', label: 'Iran' },
  { value: 'IRQ', label: 'Iraq' },
  { value: 'IRL', label: 'Ireland' },
  { value: 'ISR', label: 'Israel' },
  { value: 'ITA', label: 'Italy' },
  { value: 'CIV', label: 'Ivory Coast' },
  { value: 'JAM', label: 'Jamaica' },
  { value: 'JPN', label: 'Japan' },
  { value: 'JOR', label: 'Jordan' },
  { value: 'KAZ', label: 'Kazakhstan' },
  { value: 'KEN', label: 'Kenya' },
  { value: 'KIR', label: 'Kiribati' },
  { value: 'KWT', label: 'Kuwait' },
  { value: 'KGZ', label: 'Kyrgyzstan' },
  { value: 'LAO', label: 'Laos' },
  { value: 'LVA', label: 'Latvia' },
  { value: 'LBN', label: 'Lebanon' },
  { value: 'LSO', label: 'Lesotho' },
  { value: 'LBR', label: 'Liberia' },
  { value: 'LBY', label: 'Libya' },
  { value: 'LIE', label: 'Liechtenstein' },
  { value: 'LTU', label: 'Lithuania' },
  { value: 'LUX', label: 'Luxembourg' },
  { value: 'MAC', label: 'Macao' },
  { value: 'MDG', label: 'Madagascar' },
  { value: 'MWI', label: 'Malawi' },
  { value: 'MYS', label: 'Malaysia' },
  { value: 'MDV', label: 'Maldives' },
  { value: 'MLI', label: 'Mali' },
  { value: 'MLT', label: 'Malta' },
  { value: 'MHL', label: 'Marshall Islands' },
  { value: 'MRT', label: 'Mauritania' },
  { value: 'MUS', label: 'Mauritius' },
  { value: 'MEX', label: 'Mexico' },
  { value: 'FSM', label: 'Micronesia' },
  { value: 'MDA', label: 'Moldova' },
  { value: 'MCO', label: 'Monaco' },
  { value: 'MNG', label: 'Mongolia' },
  { value: 'MNE', label: 'Montenegro' },
  { value: 'MAR', label: 'Morocco' },
  { value: 'MOZ', label: 'Mozambique' },
  { value: 'MMR', label: 'Myanmar' },
  { value: 'NAM', label: 'Namibia' },
  { value: 'NRU', label: 'Nauru' },
  { value: 'NPL', label: 'Nepal' },
  { value: 'NLD', label: 'Netherlands' },
  { value: 'NZL', label: 'New Zealand' },
  { value: 'NIC', label: 'Nicaragua' },
  { value: 'NER', label: 'Niger' },
  { value: 'NGA', label: 'Nigeria' },
  { value: 'PRK', label: 'North Korea' },
  { value: 'MKD', label: 'North Macedonia' },
  { value: 'NOR', label: 'Norway' },
  { value: 'OMN', label: 'Oman' },
  { value: 'PAK', label: 'Pakistan' },
  { value: 'PLW', label: 'Palau' },
  { value: 'PSE', label: 'Palestine' },
  { value: 'PAN', label: 'Panama' },
  { value: 'PNG', label: 'Papua New Guinea' },
  { value: 'PRY', label: 'Paraguay' },
  { value: 'PER', label: 'Peru' },
  { value: 'POL', label: 'Poland' },
  { value: 'PRT', label: 'Portugal' },
  { value: 'QAT', label: 'Qatar' },
  { value: 'ROU', label: 'Romania' },
  { value: 'RUS', label: 'Russia' },
  { value: 'RWA', label: 'Rwanda' },
  { value: 'KNA', label: 'Saint Kitts and Nevis' },
  { value: 'LCA', label: 'Saint Lucia' },
  { value: 'VCT', label: 'Saint Vincent and the Grenadines' },
  { value: 'WSM', label: 'Samoa' },
  { value: 'SMR', label: 'San Marino' },
  { value: 'STP', label: 'Sao Tome and Principe' },
  { value: 'SAU', label: 'Saudi Arabia' },
  { value: 'SEN', label: 'Senegal' },
  { value: 'SRB', label: 'Serbia' },
  { value: 'SYC', label: 'Seychelles' },
  { value: 'SLE', label: 'Sierra Leone' },
  { value: 'SGP', label: 'Singapore' },
  { value: 'SVK', label: 'Slovakia' },
  { value: 'SVN', label: 'Slovenia' },
  { value: 'SLB', label: 'Solomon Islands' },
  { value: 'SOM', label: 'Somalia' },
  { value: 'ZAF', label: 'South Africa' },
  { value: 'KOR', label: 'South Korea' },
  { value: 'SSD', label: 'South Sudan' },
  { value: 'ESP', label: 'Spain' },
  { value: 'LKA', label: 'Sri Lanka' },
  { value: 'SDN', label: 'Sudan' },
  { value: 'SUR', label: 'Suriname' },
  { value: 'SWE', label: 'Sweden' },
  { value: 'CHE', label: 'Switzerland' },
  { value: 'SYR', label: 'Syria' },
  { value: 'TWN', label: 'Taiwan' },
  { value: 'TJK', label: 'Tajikistan' },
  { value: 'TZA', label: 'Tanzania' },
  { value: 'THA', label: 'Thailand' },
  { value: 'TLS', label: 'Timor-Leste' },
  { value: 'TGO', label: 'Togo' },
  { value: 'TON', label: 'Tonga' },
  { value: 'TTO', label: 'Trinidad and Tobago' },
  { value: 'TUN', label: 'Tunisia' },
  { value: 'TUR', label: 'Turkey' },
  { value: 'TKM', label: 'Turkmenistan' },
  { value: 'TUV', label: 'Tuvalu' },
  { value: 'UGA', label: 'Uganda' },
  { value: 'UKR', label: 'Ukraine' },
  { value: 'ARE', label: 'United Arab Emirates' },
  { value: 'GBR', label: 'United Kingdom' },
  { value: 'USA', label: 'United States' },
  { value: 'URY', label: 'Uruguay' },
  { value: 'UZB', label: 'Uzbekistan' },
  { value: 'VUT', label: 'Vanuatu' },
  { value: 'VAT', label: 'Vatican City' },
  { value: 'VEN', label: 'Venezuela' },
  { value: 'VNM', label: 'Vietnam' },
  { value: 'YEM', label: 'Yemen' },
  { value: 'ZMB', label: 'Zambia' },
  { value: 'ZWE', label: 'Zimbabwe' },
];

type CustomerFormData = {
  branch: string;
  type: string;
  is_company: boolean;
  last_name: string;
  first_name: string;
  mid_name: string;
  company_name: string;
  price_type: string;
  tin: string;
  phone: string;
  contact_name: string;
  contact_no: string;
  email: string;
  bdate: string;
  remarks: string;
  isblock: boolean;
  mode_of_payment: string;
  credit_limit: string;
  discount_code: string;
  home_number: string;
  street: string;
  zip_code: string;
  addr_type: string;
  stay_year: string;
  stay_mo: string;
  linked_account: string;
  country: string;
  province_id: string;
  province_label: string;
  city_id: string;
  city_label: string;
  barangay_id: string;
  barangay_label: string;
  sitio_id: string;
  sitio_label: string;
  owned: boolean;
  custom_code: string;
};

const emptyForm = (branch: string): CustomerFormData => ({
  branch,
  type: 'Customer',
  is_company: false,
  last_name: '',
  first_name: '',
  mid_name: '',
  company_name: '',
  price_type: '',
  tin: '',
  phone: '',
  contact_name: '',
  contact_no: '',
  email: '',
  bdate: '',
  remarks: '',
  isblock: false,
  mode_of_payment: '',
  credit_limit: '',
  discount_code: '',
  home_number: '',
  street: '',
  zip_code: '',
  addr_type: 'Current Residence',
  stay_year: '',
  stay_mo: '',
  linked_account: '',
  country: 'PHL',
  province_id: '',
  province_label: '',
  city_id: '',
  city_label: '',
  barangay_id: '',
  barangay_label: '',
  sitio_id: '',
  sitio_label: '',
  owned: false,
  custom_code: '',
});

type CustomerPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (customer: CustomerOption) => void;
};

export default function CustomerPickerModal({
  open,
  onClose,
  onSelect,
}: CustomerPickerModalProps) {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'not_built' | 'add_new' | 'update'>('list');
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  // Import / Excel dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importBranch, setImportBranch] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResultRow[] | null>(null);


  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [paymentTermOptions, setPaymentTermOptions] = useState<LookupOption[]>([]);
  const [discountOptions, setDiscountOptions] = useState<LookupOption[]>([]);
  const [accountOptions, setAccountOptions] = useState<LookupOption[]>([]);

  // Location cascade — province.provid -> city.cityid (by provid) ->
  // barangay.bid (by cityid) -> sitio.sitid (by bid). Each level's
  // options are fetched fresh when the parent selection changes.
  const [provinceOptions, setProvinceOptions] = useState<LookupOption[]>([]);
  const [cityOptions, setCityOptions] = useState<LookupOption[]>([]);
  const [barangayOptions, setBarangayOptions] = useState<LookupOption[]>([]);
  const [sitioOptions, setSitioOptions] = useState<LookupOption[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [barangayLoading, setBarangayLoading] = useState(false);
  const [sitioLoading, setSitioLoading] = useState(false);

  const [form, setForm] = useState<CustomerFormData>(emptyForm(''));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'update'>('create');
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const loadCustomers = () => {
    setLoading(true);
    setLoadError(false);
    apiFetch('/approval/reports/customers/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        const list = data?.customers;
        if (Array.isArray(list)) {
          setCustomers(list);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedCode(null);
    setView('list');
    loadCustomers();

    apiFetch('/approval/reports/branches/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.branches)) setBranches(data.branches);
      })
      .catch(() => {});

    apiFetch('/approval/reports/payment-terms/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.payment_terms)) setPaymentTermOptions(data.payment_terms);
      })
      .catch(() => {});

    apiFetch('/approval/reports/discount-codes/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.discounts)) setDiscountOptions(data.discounts);
      })
      .catch(() => {});

    // Same source the DV entry form's Account Title combobox uses —
    // reused here for the "Linked Account" field (rssys.m06_at).
    apiFetch('/approval/reports/chart-of-accounts/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.accounts)) setAccountOptions(data.accounts);
      })
      .catch(() => {});

    apiFetch('/approval/reports/provinces/')
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.provinces)) setProvinceOptions(data.provinces);
      })
      .catch(() => {});
  }, [open]);

  const loadCities = (provinceId: string) => {
    setCityOptions([]);
    setBarangayOptions([]);
    setSitioOptions([]);
    if (!provinceId) return;
    setCityLoading(true);
    apiFetch(`/approval/reports/cities/?province_id=${encodeURIComponent(provinceId)}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.cities)) setCityOptions(data.cities);
      })
      .catch(() => {})
      .finally(() => setCityLoading(false));
  };

  const loadBarangays = (cityId: string) => {
    setBarangayOptions([]);
    setSitioOptions([]);
    if (!cityId) return;
    setBarangayLoading(true);
    apiFetch(`/approval/reports/barangays/?city_id=${encodeURIComponent(cityId)}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.barangays)) setBarangayOptions(data.barangays);
      })
      .catch(() => {})
      .finally(() => setBarangayLoading(false));
  };

  const loadSitios = (barangayId: string) => {
    setSitioOptions([]);
    if (!barangayId) return;
    setSitioLoading(true);
    apiFetch(`/approval/reports/sitios/?barangay_id=${encodeURIComponent(barangayId)}`)
      .then((res) => (res.ok ? res.json() : Promise.resolve(null)))
      .then((data) => {
        if (Array.isArray(data?.sitios)) setSitioOptions(data.sitios);
      })
      .catch(() => {})
      .finally(() => setSitioLoading(false));
  };

  const filteredCustomers = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.label.toLowerCase().includes(q) ||
      c.value.toLowerCase().includes(q)
    );
  });

  const selectedCustomer = customers.find((c) => c.value === selectedCode) ?? null;

  // EDITED — now passes the full row (address/phone/email/active), not
  // just {value, label}, so Sales can populate its order entry header
  // without a second fetch. DV's callers only read .value/.label off
  // whatever comes back, so this is backward-compatible for them.
  const chooseCustomer = (row: CustomerRow) => {
    onSelect({
      value: row.value,
      label: row.label,
      address: row.address,
      phone: row.phone,
      email: row.email,
      active: row.active,
    });
    onClose();
  };

  const openAddNew = () => {
    setFormMode('create');
    setEditingCode(null);
    setForm(emptyForm(branches[0]?.value ?? ''));
    setFormError(null);
    setView('add_new');
  };

  const openUpdate = async () => {
    if (!selectedCustomer) return;
    setFormMode('update');
    setEditingCode(selectedCustomer.value);
    setFormError(null);
    setView('update');
    setFormLoading(true);
    try {
      const res = await apiFetch(`/approval/customer/${encodeURIComponent(selectedCustomer.value)}/`);
      const data = res.ok ? await res.json() : null;
      const c = data?.customer;
      if (c) {
        setForm({
          branch: c.branch || '',
          type: c.type || 'Customer',
          is_company: !!c.is_company,
          last_name: c.last_name || '',
          first_name: c.first_name || '',
          mid_name: c.mid_name || '',
          company_name: c.company_name || '',
          price_type: c.price_type || '',
          tin: c.tin || '',
          phone: c.phone || '',
          contact_name: c.contact_name || '',
          contact_no: c.contact_no || '',
          email: c.email || '',
          bdate: c.bdate || '',
          remarks: c.remarks || '',
          isblock: !!c.isblock,
          mode_of_payment: c.mode_of_payment || '',
          credit_limit: c.credit_limit !== null && c.credit_limit !== undefined ? String(c.credit_limit) : '',
          discount_code: c.discount_code || '',
          home_number: c.address?.home_number || '',
          street: c.address?.street || '',
          zip_code: c.address?.zip_code || '',
          addr_type: c.address?.addr_type || 'Current Residence',
          stay_year: c.address?.stay_year !== null && c.address?.stay_year !== undefined ? String(c.address.stay_year) : '',
          stay_mo: c.address?.stay_mo !== null && c.address?.stay_mo !== undefined ? String(c.address.stay_mo) : '',
          linked_account: c.linked_account || '',
          country: c.address?.country || 'PHL',
          province_id: c.address?.province_id !== null && c.address?.province_id !== undefined ? String(c.address.province_id) : '',
          province_label: c.address?.province_name || '',
          city_id: c.address?.city_id !== null && c.address?.city_id !== undefined ? String(c.address.city_id) : '',
          city_label: c.address?.city_name || '',
          barangay_id: c.address?.barangay_id !== null && c.address?.barangay_id !== undefined ? String(c.address.barangay_id) : '',
          barangay_label: c.address?.barangay_name || '',
          sitio_id: c.address?.sitio_id !== null && c.address?.sitio_id !== undefined ? String(c.address.sitio_id) : '',
          sitio_label: c.address?.sitio_name || '',
          owned: !!c.address?.owned,
          custom_code: '',
        });
        // Pre-populate the dependent dropdown option lists so the
        // existing selections actually render as chosen, not blank,
        // the moment the Address dialog is opened.
        if (c.address?.province_id) {
          loadCities(String(c.address.province_id));
        }
        if (c.address?.city_id) {
          loadBarangays(String(c.address.city_id));
        }
        if (c.address?.barangay_id) {
          loadSitios(String(c.address.barangay_id));
        }
      } else {
        setFormError('Could not load customer details.');
      }
    } catch {
      setFormError('Could not load customer details.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selectedCustomer) return;
    const willActivate = selectedCustomer.active === false;
    setTogglingActive(true);
    try {
      const res = await apiFetch(
        `/approval/customer/${encodeURIComponent(selectedCustomer.value)}/${willActivate ? 'activate' : 'deactivate'}/`,
        { method: 'PUT' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.message || `Could not ${willActivate ? 'activate' : 'deactivate'} this customer.`);
        return;
      }
      loadCustomers();
    } catch {
      alert(`Could not ${willActivate ? 'activate' : 'deactivate'} this customer. Check the console for details.`);
    } finally {
      setTogglingActive(false);
    }
  };

  const handlePrintList = () => {
    const rows = filteredCustomers
      .map(
        (c) => `
          <tr>
            <td>${c.value}</td>
            <td>${c.label}</td>
            <td>${c.phone || ''}</td>
            <td>${c.email || ''}</td>
            <td>${c.address || ''}</td>
            <td>${c.active === false ? 'Inactive' : 'Active'}</td>
          </tr>`,
      )
      .join('');

    const html = `
      <html>
        <head>
          <title>Customer List</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            p { color: #666; margin-top: 0; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>Customer List</h1>
          <p>Printed ${new Date().toLocaleString()} — ${filteredCustomers.length} customer${filteredCustomers.length === 1 ? '' : 's'}</p>
          <table>
            <thead>
              <tr><th>ID</th><th>Customer</th><th>Phone</th><th>Email</th><th>Address</th><th>Status</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Could not open the print window — check if your browser blocked the popup.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  const emptyImportRow = (): ImportRow => ({
    type: 'Customer',
    is_company: false,
    last_name: '',
    first_name: '',
    mid_name: '',
    company_name: '',
    price_type: '',
    tin: '',
    phone: '',
    contact_name: '',
    contact_no: '',
    email: '',
    credit_limit: '',
  });

  // Accepts .csv or .xlsx. Expected header row (case-insensitive):
  // Last Name, First Name, Mid Name, Company Name, Phone, Email, TIN,
  // Contact Name, Contact Number, Price Type, Credit Limit.
  // A row is treated as a company row if Company Name is filled and
  // Last/First Name are both blank.
  const handleImportFile = async (file: File) => {
    setImportParseError(null);
    setImportRows([]);
    setImportResults(null);
    setImportFile(file);

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (raw.length === 0) {
        setImportParseError('No rows found in this file.');
        return;
      }

      const norm = (obj: Record<string, unknown>, ...keys: string[]) => {
        const lower: Record<string, unknown> = {};
        Object.keys(obj).forEach((k) => (lower[k.trim().toLowerCase()] = obj[k]));
        for (const key of keys) {
          const v = lower[key.toLowerCase()];
          if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
        }
        return '';
      };

      const parsed: ImportRow[] = raw.map((r) => {
        const companyName = norm(r, 'company name', 'company');
        const lastName = norm(r, 'last name', 'lastname');
        const firstName = norm(r, 'first name', 'firstname');
        const isCompany = !!companyName && !lastName && !firstName;
        return {
          ...emptyImportRow(),
          is_company: isCompany,
          company_name: companyName,
          last_name: lastName,
          first_name: firstName,
          mid_name: norm(r, 'mid name', 'middle name', 'midname'),
          phone: norm(r, 'phone', 'phone number'),
          email: norm(r, 'email', 'email address'),
          tin: norm(r, 'tin', 'tin number'),
          contact_name: norm(r, 'contact name'),
          contact_no: norm(r, 'contact number', 'contact no'),
          price_type: norm(r, 'price type'),
          credit_limit: norm(r, 'credit limit'),
        };
      });

      setImportRows(parsed);
    } catch (err) {
      console.error('Import parse error:', err);
      setImportParseError(
        'Could not read this file. Make sure it\u2019s a valid .xlsx or .csv, with columns like "Last Name", "First Name", "Company Name", etc.',
      );
    }
  };

  const runImport = async () => {
    if (!importBranch) return setImportParseError('Select a branch before importing.');
    if (importRows.length === 0) return;

    setImporting(true);
    setImportResults(null);
    try {
      const res = await apiFetch('/approval/bulk-import-customers/', {
        method: 'POST',
        body: JSON.stringify({ branch: importBranch, rows: importRows }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setImportParseError(data?.message || `Import failed (${res.status})`);
        return;
      }
      setImportResults(data?.results || []);
      loadCustomers();
    } catch {
      setImportParseError('Could not reach the server. Check the console for details.');
    } finally {
      setImporting(false);
    }
  };

  const closeImportDialog = () => {
    setImportDialogOpen(false);
    setImportFile(null);
    setImportRows([]);
    setImportParseError(null);
    setImportResults(null);
  };

  const saveCustomer = async () => {
    setFormError(null);
    if (form.is_company) {
      if (!form.company_name.trim()) return setFormError('Company Name is required.');
    } else {
      if (!form.last_name.trim()) return setFormError('Last Name is required.');
      if (!form.first_name.trim()) return setFormError('First Name is required.');
    }

    setSaving(true);
    try {
      const body = {
        branch: form.branch,
        type: form.type,
        is_company: form.is_company,
        d_code: formMode === 'create' ? (form.custom_code.trim() || null) : undefined,
        last_name: form.last_name.trim(),
        first_name: form.first_name.trim(),
        mid_name: form.mid_name.trim(),
        company_name: form.company_name.trim(),
        price_type: form.price_type || null,
        tin: form.tin.trim() || null,
        phone: form.phone.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_no: form.contact_no.trim() || null,
        email: form.email.trim() || null,
        bdate: form.bdate || null,
        remarks: form.remarks.trim() || null,
        // isblock is only sent on Update — a brand-new customer can't
        // already be blocked, and the backend is expected to stamp
        // blockedby/blockeddate/blockedtime itself when this flips,
        // not trust values coming from the client.
        isblock: formMode === 'update' ? form.isblock : undefined,
        mode_of_payment: form.mode_of_payment || null,
        credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
        discount_code: form.discount_code || null,
        linked_account: form.linked_account || null,
        address: {
          home_number: form.home_number.trim() || null,
          street: form.street.trim() || null,
          zip_code: form.zip_code.trim() || null,
          addr_type: form.addr_type || null,
          stay_year: form.stay_year ? parseInt(form.stay_year, 10) : null,
          stay_mo: form.stay_mo ? parseInt(form.stay_mo, 10) : null,
          country: form.country || null,
          province_id: form.province_id ? parseInt(form.province_id, 10) : null,
          city_id: form.city_id ? parseInt(form.city_id, 10) : null,
          barangay_id: form.barangay_id ? parseInt(form.barangay_id, 10) : null,
          sitio_id: form.sitio_id ? parseInt(form.sitio_id, 10) : null,
          owned: form.owned,
        },
      };

      const res =
        formMode === 'create'
          ? await apiFetch('/approval/create-customer/', {
              method: 'POST',
              body: JSON.stringify(body),
            })
          : await apiFetch(`/approval/update-customer/${encodeURIComponent(editingCode!)}/`, {
              method: 'PUT',
              body: JSON.stringify(body),
            });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(data?.message || `Request failed (${res.status})`);
        return;
      }

      loadCustomers();
      setView('list');
      if (formMode === 'create' && data?.code) {
        chooseCustomer({ value: data.code, label: data.name || form.company_name || `${form.last_name}, ${form.first_name}` });
      } else if (formMode === 'update' && editingCode) {
        setSelectedCode(editingCode);
      }
    } catch (err) {
      console.error('Error creating customer:', err);
      setFormError('Could not create the customer. Check the console for details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="!max-w-3xl" style={{ maxWidth: '48rem' }}>
        <DialogHeader>
          <DialogTitle>Customers</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3">
          <div className="w-32 shrink-0 flex flex-col gap-1.5">
            <Button
              size="sm"
              onClick={openAddNew}
              className="justify-start bg-orange-500 hover:bg-orange-600 text-white text-xs h-8"
            >
              Add New
            </Button>
            <Button
              size="sm"
              onClick={openUpdate}
              disabled={!selectedCustomer}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Update
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setImportBranch(branches[0]?.value ?? '');
                setImportDialogOpen(true);
              }}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Import / Excel
            </Button>
            <Button
              size="sm"
              onClick={handleToggleActive}
              disabled={!selectedCustomer || togglingActive}
              variant="outline"
              className={
                selectedCustomer?.active === false
                  ? 'justify-start text-xs h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950/30'
                  : 'justify-start text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30'
              }
            >
              {togglingActive && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              {selectedCustomer?.active === false ? 'Activate' : 'Deactivate'}
            </Button>
            <Button
              size="sm"
              onClick={handlePrintList}
              variant="outline"
              className="justify-start text-xs h-8"
            >
              Print List
            </Button>
          </div>

          <div className="flex-1 min-w-0">
            {view === 'not_built' ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg">
                This action isn&apos;t built yet.
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => setView('list')}>Back to List</Button>
                </div>
              </div>
            ) : view === 'add_new' || view === 'update' ? (
              formLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading customer...
                </div>
              ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3 max-h-[440px] overflow-y-auto">
                <div>
                  <Label htmlFor="cu_id" className="text-xs">ID</Label>
                  <Input
                    id="cu_id"
                    value={formMode === 'update' ? (editingCode || '') : form.custom_code}
                    disabled={formMode === 'update'}
                    onChange={(e) => setForm((f) => ({ ...f, custom_code: e.target.value }))}
                    placeholder="(auto-generated)"
                    className="h-8 text-xs disabled:opacity-60"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Leave blank to auto-generate (branch + sequence, same as the desktop).
                    Type a code here to set it manually instead.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="cu_type" className="text-xs">Type</Label>
                    <select
                      id="cu_type"
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                      {CUSTOMER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="cu_branch" className="text-xs">Branch</Label>
                    <select
                      id="cu_branch"
                      value={form.branch}
                      onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                      className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                      {branches.map((b) => (
                        <option key={b.value} value={b.value}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={form.is_company}
                        onChange={(e) => setForm((f) => ({ ...f, is_company: e.target.checked }))}
                      />
                      Company
                    </label>
                  </div>
                </div>

                {form.is_company ? (
                  <div>
                    <Label htmlFor="cu_company" className="text-xs">
                      Company Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="cu_company"
                      autoFocus
                      value={form.company_name}
                      onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="cu_last" className="text-xs">
                        Last Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cu_last"
                        autoFocus
                        value={form.last_name}
                        onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cu_first" className="text-xs">
                        First Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cu_first"
                        value={form.first_name}
                        onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cu_mid" className="text-xs">Mid Name</Label>
                      <Input
                        id="cu_mid"
                        value={form.mid_name}
                        onChange={(e) => setForm((f) => ({ ...f, mid_name: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}

                {!form.is_company && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cu_bdate" className="text-xs">
                        Birthdate <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cu_bdate"
                        type="date"
                        value={form.bdate}
                        onChange={(e) => setForm((f) => ({ ...f, bdate: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex items-end pb-1.5">
                      <label
                        className={`flex items-center gap-1.5 text-xs ${
                          formMode === 'create'
                            ? 'text-slate-400 cursor-not-allowed'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                        title={
                          formMode === 'create'
                            ? "Can't block a customer that doesn't exist yet — available after saving."
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={form.isblock}
                          disabled={formMode === 'create'}
                          onChange={(e) => setForm((f) => ({ ...f, isblock: e.target.checked }))}
                        />
                        Block
                      </label>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cu_price_type" className="text-xs">Price Type</Label>
                    <select
                      id="cu_price_type"
                      value={form.price_type}
                      onChange={(e) => setForm((f) => ({ ...f, price_type: e.target.value }))}
                      className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                      <option value="">Select...</option>
                      {PRICE_TYPES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="cu_tin" className="text-xs">TIN Number</Label>
                    <Input
                      id="cu_tin"
                      value={form.tin}
                      onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cu_phone" className="text-xs">Phone</Label>
                    <Input
                      id="cu_phone"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cu_email" className="text-xs">Email</Label>
                    <Input
                      id="cu_email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cu_contact_name" className="text-xs">Contact Name</Label>
                    <Input
                      id="cu_contact_name"
                      value={form.contact_name}
                      onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cu_contact_no" className="text-xs">Contact Number</Label>
                    <Input
                      id="cu_contact_no"
                      value={form.contact_no}
                      onChange={(e) => setForm((f) => ({ ...f, contact_no: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="cu_remarks" className="text-xs">Remarks</Label>
                  <textarea
                    id="cu_remarks"
                    value={form.remarks}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                    rows={2}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 py-1.5 resize-none"
                  />
                </div>

                <div className="border-t border-slate-100 dark:border-slate-700 pt-3 grid grid-cols-2 gap-3">
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      Address
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mb-2 truncate">
                      {form.home_number || form.street || form.zip_code
                        ? [form.home_number, form.street, form.zip_code].filter(Boolean).join(', ')
                        : 'Not set'}
                    </p>
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7 w-full" onClick={() => setAddressDialogOpen(true)}>
                      {form.home_number || form.street || form.zip_code ? 'Edit Address' : 'Add Address'}
                    </Button>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      Linked Account
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mb-2 truncate">
                      {form.linked_account
                        ? accountOptions.find((a) => a.value === form.linked_account)?.label || form.linked_account
                        : 'None'}
                    </p>
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7 w-full" onClick={() => setAccountDialogOpen(true)}>
                      {form.linked_account ? 'Edit Account' : 'Add Account'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                  <div>
                    <Label htmlFor="cu_mop" className="text-xs">Mode of Payment</Label>
                    <select
                      id="cu_mop"
                      value={form.mode_of_payment}
                      onChange={(e) => setForm((f) => ({ ...f, mode_of_payment: e.target.value }))}
                      className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                      <option value="">Select...</option>
                      {paymentTermOptions.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="cu_credit_limit" className="text-xs">Credit Limit</Label>
                    <Input
                      id="cu_credit_limit"
                      type="number"
                      value={form.credit_limit}
                      onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cu_discount" className="text-xs">Discount</Label>
                    <select
                      id="cu_discount"
                      value={form.discount_code}
                      onChange={(e) => setForm((f) => ({ ...f, discount_code: e.target.value }))}
                      className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
                    >
                      <option value="">Select...</option>
                      {discountOptions.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {formError && <p className="text-xs text-red-500">{formError}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setView('list')} disabled={saving}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveCustomer} disabled={saving}>
                    {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>
              )
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by customer name or ID..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-[360px] overflow-y-auto">
                  <table className="text-xs w-full">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/80">
                      <tr className="text-slate-500 dark:text-slate-400 text-left">
                        <th className="px-3 py-2 font-medium w-28">ID</th>
                        <th className="px-3 py-2 font-medium">Customer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-8 text-center text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Loading customers...
                          </td>
                        </tr>
                      ) : loadError ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-8 text-center text-red-500">
                            Could not load customers -- check backend connection.
                          </td>
                        </tr>
                      ) : filteredCustomers.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-3 py-8 text-center text-slate-400">
                            No customers found.
                          </td>
                        </tr>
                      ) : (
                        filteredCustomers.map((r) => (
                          <tr
                            key={r.value}
                            onClick={() => setSelectedCode(r.value)}
                            onDoubleClick={() => chooseCustomer(r)}
                            className={`cursor-pointer ${r.active === false ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'} ${
                              selectedCode === r.value
                                ? 'bg-orange-50 dark:bg-orange-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-900/40'
                            }`}
                          >
                            <td className="px-3 py-2 text-slate-500">{r.value}</td>
                            <td className="px-3 py-2 font-medium">
                              {r.label}
                              {r.active === false && (
                                <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-red-400">
                                  Inactive
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {filteredCustomers.length} customer{filteredCustomers.length === 1 ? '' : 's'} -- double-click a row, or select it and use Select.
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {view === 'list' && (
            <Button
              size="sm"
              onClick={() => selectedCustomer && chooseCustomer(selectedCustomer)}
              disabled={!selectedCustomer}
            >
              Select
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Customer Address — nested dialog, matches desktop's own popup
        (Type dropdown, Country/Province/City/Barangay/Sitio -- last four
        deferred, see note below -- Street, House Number, Zip, Length of
        Stay, Sketch/Map Link -- also deferred). One address per customer
        for now; "Save Address" just writes into the shared form state,
        the actual API call happens on the main Save Customer click. */}
    <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
      <DialogContent className="!max-w-lg" style={{ maxWidth: '32rem' }}>
        <DialogHeader>
          <DialogTitle>Customer Address</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cu_addr_customer_id" className="text-xs">Customer ID</Label>
              <Input
                id="cu_addr_customer_id"
                value={formMode === 'update' ? (editingCode || '') : form.custom_code}
                disabled={formMode === 'update'}
                onChange={(e) => setForm((f) => ({ ...f, custom_code: e.target.value }))}
                placeholder="(assigned on save)"
                className="h-8 text-xs disabled:opacity-60"
              />
            </div>
            <div>
              <Label className="text-xs">Line No.</Label>
              <div className="h-8 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-500">
                1
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cu_addr_type" className="text-xs">Type</Label>
              <select
                id="cu_addr_type"
                value={form.addr_type}
                onChange={(e) => setForm((f) => ({ ...f, addr_type: e.target.value }))}
                className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
              >
                {ADDRESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs block mb-1">Length of Stay</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Input
                    id="cu_stay_year"
                    type="number"
                    value={form.stay_year}
                    onChange={(e) => setForm((f) => ({ ...f, stay_year: e.target.value }))}
                    placeholder="Yr"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="relative">
                  <Input
                    id="cu_stay_mo"
                    type="number"
                    value={form.stay_mo}
                    onChange={(e) => setForm((f) => ({ ...f, stay_mo: e.target.value }))}
                    placeholder="Mo"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="cu_country" className="text-xs">Country</Label>
            <select
              id="cu_country"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
            >
              {form.country && !COUNTRIES.some((c) => c.value === form.country) && (
                <option value={form.country}>{form.country}</option>
              )}
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cu_province" className="text-xs">Province</Label>
              <select
                id="cu_province"
                value={form.province_id}
                onChange={(e) => {
                  const provinceId = e.target.value;
                  setForm((f) => ({
                    ...f,
                    province_id: provinceId,
                    city_id: '',
                    barangay_id: '',
                    sitio_id: '',
                  }));
                  loadCities(provinceId);
                }}
                className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
              >
                <option value="">Select...</option>
                {provinceOptions.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cu_city" className="text-xs">City/Municipality</Label>
              <select
                id="cu_city"
                value={form.city_id}
                disabled={!form.province_id || cityLoading}
                onChange={(e) => {
                  const cityId = e.target.value;
                  setForm((f) => ({ ...f, city_id: cityId, barangay_id: '', sitio_id: '' }));
                  loadBarangays(cityId);
                }}
                className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 disabled:opacity-60"
              >
                <option value="">{cityLoading ? 'Loading...' : 'Select...'}</option>
                {cityOptions.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cu_barangay" className="text-xs">Baranggay</Label>
              <select
                id="cu_barangay"
                value={form.barangay_id}
                disabled={!form.city_id || barangayLoading}
                onChange={(e) => {
                  const barangayId = e.target.value;
                  setForm((f) => ({ ...f, barangay_id: barangayId, sitio_id: '' }));
                  loadSitios(barangayId);
                }}
                className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 disabled:opacity-60"
              >
                <option value="">{barangayLoading ? 'Loading...' : 'Select...'}</option>
                {barangayOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cu_sitio" className="text-xs">Sitio</Label>
              <select
                id="cu_sitio"
                value={form.sitio_id}
                disabled={!form.barangay_id || sitioLoading}
                onChange={(e) => setForm((f) => ({ ...f, sitio_id: e.target.value }))}
                className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 disabled:opacity-60"
              >
                <option value="">{sitioLoading ? 'Loading...' : 'Select...'}</option>
                {sitioOptions.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="cu_street" className="text-xs">Street Address</Label>
            <Input
              id="cu_street"
              value={form.street}
              onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
              className="h-8 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cu_home" className="text-xs">House Number</Label>
              <Input
                id="cu_home"
                value={form.home_number}
                onChange={(e) => setForm((f) => ({ ...f, home_number: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="cu_zip" className="text-xs">Zip Code</Label>
              <Input
                id="cu_zip"
                value={form.zip_code}
                onChange={(e) => setForm((f) => ({ ...f, zip_code: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <p className="text-[10px] text-slate-400">
            Sketch upload and Map Link aren&apos;t included yet.
          </p>

          <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={form.owned}
              onChange={(e) => setForm((f) => ({ ...f, owned: e.target.checked }))}
            />
            Owned?
          </label>
          <p className="text-[10px] text-slate-400 -mt-2">
            Saved on the customer record (rssys.m06.resi_owned), not per-address — the real
            column lives on the customer table, not the address table, even though the
            desktop shows it on this popup. Value(PHP) isn&apos;t included -- no matching
            column exists in either table.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm((f) => ({
                ...f,
                home_number: '', street: '', zip_code: '', addr_type: 'Current Residence',
                stay_year: '', stay_mo: '', country: 'PHL',
                province_id: '', province_label: '', city_id: '', city_label: '',
                barangay_id: '', barangay_label: '', sitio_id: '', sitio_label: '', owned: false,
              }));
              setCityOptions([]);
              setBarangayOptions([]);
              setSitioOptions([]);
              setAddressDialogOpen(false);
            }}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
          >
            Remove
          </Button>
          <Button size="sm" onClick={() => setAddressDialogOpen(false)}>Save Address</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Customer Account — nested dialog, matches desktop's own "Customer
        Account" popup (Account Link + Current Main Account). One linked
        account per customer for now; same "write into shared form state,
        API call happens on main Save" pattern as the Address dialog. */}
    <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
      <DialogContent className="!max-w-sm" style={{ maxWidth: '24rem' }}>
        <DialogHeader>
          <DialogTitle>Customer Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Line No.</Label>
              <div className="h-8 flex items-center px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-500">
                1
              </div>
            </div>
            <div>
              <Label htmlFor="cu_acct_customer_id" className="text-xs">Customer ID</Label>
              <Input
                id="cu_acct_customer_id"
                value={formMode === 'update' ? (editingCode || '') : form.custom_code}
                disabled={formMode === 'update'}
                onChange={(e) => setForm((f) => ({ ...f, custom_code: e.target.value }))}
                placeholder="(assigned on save)"
                className="h-8 text-xs disabled:opacity-60"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="cu_linked_account" className="text-xs">Account Link</Label>
            <select
              id="cu_linked_account"
              value={form.linked_account}
              onChange={(e) => setForm((f) => ({ ...f, linked_account: e.target.value }))}
              className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
            >
              <option value="">None</option>
              {[...accountOptions]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              Set as the customer&apos;s main linked account (rssys.m06_at). One link per
              customer for now, matching the desktop&apos;s &quot;Current Main Account&quot;
              option -- multiple linked accounts aren&apos;t supported yet.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm((f) => ({ ...f, linked_account: '' }));
              setAccountDialogOpen(false);
            }}
            className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
          >
            Remove
          </Button>
          <Button size="sm" onClick={() => setAccountDialogOpen(false)}>Save Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Import / Excel — parses an .xlsx or .csv file client-side (via
        the xlsx/SheetJS library — needs `npm install xlsx` in this repo
        if not already present) and bulk-creates customers through
        /approval/bulk-import-customers/. Expected columns (case-
        insensitive, order doesn't matter): Last Name, First Name, Mid
        Name, Company Name, Phone, Email, TIN, Contact Name, Contact
        Number, Price Type, Credit Limit. A row is treated as a company
        row when Company Name is filled and Last/First Name are both
        blank. Address and Linked Account are NOT importable this pass
        — same first-pass scope as Add New's own deferred fields. */}
    <Dialog open={importDialogOpen} onOpenChange={(v) => !v && closeImportDialog()}>
      <DialogContent className="!max-w-2xl" style={{ maxWidth: '42rem' }}>
        <DialogHeader>
          <DialogTitle>Import Customers</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="import_branch" className="text-xs">Branch</Label>
            <select
              id="import_branch"
              value={importBranch}
              onChange={(e) => setImportBranch(e.target.value)}
              className="w-full h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2"
            >
              {branches.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              New customer IDs are generated using this branch&apos;s prefix, same as Add New.
            </p>
          </div>

          <div>
            <Label htmlFor="import_file" className="text-xs">File (.xlsx or .csv)</Label>
            <input
              id="import_file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
              }}
              className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Expected columns: Last Name, First Name, Mid Name, Company Name, Phone, Email,
              TIN, Contact Name, Contact Number, Price Type, Credit Limit. Address and Linked
              Account aren&apos;t importable yet — add those individually after import.
            </p>
          </div>

          {importParseError && <p className="text-xs text-red-500">{importParseError}</p>}

          {importRows.length > 0 && !importResults && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-64 overflow-y-auto">
              <table className="text-xs w-full">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/80">
                  <tr className="text-slate-500 dark:text-slate-400 text-left">
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 font-medium">Type</th>
                    <th className="px-2 py-1.5 font-medium">Phone</th>
                    <th className="px-2 py-1.5 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importRows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        {r.is_company ? r.company_name : `${r.last_name}, ${r.first_name}`}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500">{r.is_company ? 'Company' : 'Individual'}</td>
                      <td className="px-2 py-1.5 text-slate-500">{r.phone}</td>
                      <td className="px-2 py-1.5 text-slate-500">{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {importRows.length > 0 && !importResults && (
            <p className="text-[10px] text-slate-400">
              {importRows.length} row{importRows.length === 1 ? '' : 's'} ready to import.
            </p>
          )}

          {importResults && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-64 overflow-y-auto">
              <table className="text-xs w-full">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900/80">
                  <tr className="text-slate-500 dark:text-slate-400 text-left">
                    <th className="px-2 py-1.5 font-medium">Row</th>
                    <th className="px-2 py-1.5 font-medium">Name</th>
                    <th className="px-2 py-1.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importResults.map((r) => (
                    <tr key={r.row}>
                      <td className="px-2 py-1.5 text-slate-500">{r.row}</td>
                      <td className="px-2 py-1.5">{r.name || '(unnamed)'}</td>
                      <td className={`px-2 py-1.5 ${r.status === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {r.status === 'success' ? `Created (${r.code})` : r.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {importResults && (
            <p className="text-xs text-slate-500">
              {importResults.filter((r) => r.status === 'success').length} of {importResults.length} imported successfully.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={closeImportDialog}>
            {importResults ? 'Close' : 'Cancel'}
          </Button>
          {!importResults && (
            <Button size="sm" onClick={runImport} disabled={importing || importRows.length === 0}>
              {importing && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Import {importRows.length > 0 ? `${importRows.length} Customer${importRows.length === 1 ? '' : 's'}` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}