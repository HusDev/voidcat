// Example data for the first screens, until the local library is built. Every name and number here is made up.

export type DocStatus = "current" | "renew" | "stamps" | "replaced" | "record";

export type Doc = {
  id: string;
  area: string;
  title: string;
  status: DocStatus;
  statusLabel: string;
  facts: { label: string; value: string; mono?: boolean }[];
};

export const docs: Doc[] = [
  { id: "passport", area: "Identity", title: "Passport", status: "current", statusLabel: "Current", facts: [{ label: "Number", value: "P4821907", mono: true }, { label: "Valid to", value: "23 Feb 2034" }] },
  { id: "card", area: "Residency", title: "Residence card", status: "renew", statusLabel: "Renew in 5 months", facts: [{ label: "Card no.", value: "E10293847", mono: true }, { label: "Valid to", value: "16 Mar 2027" }] },
  { id: "lease", area: "Home", title: "Rental contract", status: "current", statusLabel: "Current", facts: [{ label: "Rent", value: "€1,150 / month" }, { label: "Ends", value: "31 Oct 2027" }] },
  { id: "payslip", area: "Work & money", title: "Payslip · September", status: "record", statusLabel: "Record", facts: [{ label: "Net pay", value: "€3,240" }, { label: "Employer", value: "Northwind S.L." }] },
  { id: "diploma", area: "Education", title: "University diploma", status: "stamps", statusLabel: "Needs 2 stamps", facts: [{ label: "Degree", value: "B.Sc. Computer Science" }, { label: "Missing", value: "Legalisation, sworn translation" }] },
  { id: "old-card", area: "Residency", title: "Old residence card", status: "replaced", statusLabel: "Replaced", facts: [{ label: "Card no.", value: "E08812366", mono: true }, { label: "Valid to", value: "16 Mar 2024" }] },
];

export const areas = [
  { name: "Identity", count: 6 },
  { name: "Residency", count: 9 },
  { name: "Work & money", count: 14 },
  { name: "Home", count: 5 },
  { name: "Education", count: 4 },
];

export type PendingFact = { id: string; label: string; value: string; source: string };

export const pendingFacts: PendingFact[] = [
  { id: "rent", label: "Rent", value: "€1,150 a month", source: "Rental contract, p. 1" },
  { id: "start", label: "Lease starts", value: "1 Nov 2026", source: "Rental contract, p. 1" },
  { id: "deposit", label: "Deposit", value: "€2,300", source: "Rental contract, p. 1" },
  { id: "landlord", label: "Landlord", value: "Carla Ruiz", source: "Rental contract, p. 8" },
];

export type Access = "masked-search" | "masked-facts" | "everything" | "off";

export const accessLabel: Record<Access, string> = {
  "masked-search": "Masked facts and search",
  "masked-facts": "Masked facts only",
  everything: "Everything, unmasked",
  off: "Nothing",
};

export const ais: { id: string; name: string; how: string; access: Access; local?: boolean }[] = [
  { id: "claude", name: "Claude", how: "Claude Desktop, through MCP", access: "masked-search" },
  { id: "chatgpt", name: "ChatGPT", how: "ChatGPT connector", access: "masked-facts" },
  { id: "gemini", name: "Gemini", how: "Gemini CLI, through MCP", access: "masked-facts" },
  { id: "local", name: "Local model", how: "Runs on this Mac", access: "everything", local: true },
];
