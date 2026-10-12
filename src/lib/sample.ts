// Example data for screens not yet wired to the library (Connected AIs). Every name and number here is made up.

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
