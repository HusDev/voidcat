import { useEffect, useState } from "react";
import { savedModel } from "./cloud";
import { getSecret, onMac } from "./library";
import { type AskModel, type LocalModel, listLocalModels, saveAskModel, savedAskModel } from "./models";

/** The model that answers in Ask: the saved choice while it's available, else one on this Mac, else the cloud model. */
export function useAskModel() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [local, setLocal] = useState<LocalModel[] | null>(null);
  const [chosen, setChosen] = useState(savedAskModel);

  useEffect(() => {
    // A refused Keychain prompt just means no cloud model for now.
    if (onMac)
      getSecret("openrouter")
        .then((k) => setHasKey(!!k))
        .catch(() => setHasKey(false));
    listLocalModels().then(setLocal);
  }, []);

  const cloudModel = hasKey ? savedModel() : null;
  const available = (m: AskModel | null) => !!m && (m.provider === "local" ? !!local?.some((l) => l.id === m.id) : m.id === cloudModel);
  const model: AskModel | null = available(chosen)
    ? chosen
    : local?.length
      ? { provider: "local", id: local[0].id }
      : cloudModel
        ? { provider: "cloud", id: cloudModel }
        : null;
  const choose = (m: AskModel) => {
    setChosen(m);
    saveAskModel(m);
  };
  return { model, choose, local, cloudModel, needsSetup: hasKey !== null && !model };
}
