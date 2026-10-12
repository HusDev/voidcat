// Example data for screens not yet wired to the library (Facts to approve, Connected AIs). Every name and number here is made up.

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
