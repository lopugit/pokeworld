const THINGTIME_SDK_SRC = "https://thingtime.com/sdk/thingtime-login.js";

let sdkPromise: Promise<ThingtimeSdk> | undefined;

function currentSdk() {
  return window.Thingtime?.login ? window.Thingtime : undefined;
}

export function loadThingtimeSdk() {
  const loaded = currentSdk();
  if (loaded) return Promise.resolve(loaded);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<ThingtimeSdk>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-pokeworld-thingtime-login]");
    const script = existing || document.createElement("script");

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const handleLoad = () => {
      cleanup();
      const sdk = currentSdk();
      if (sdk) resolve(sdk);
      else {
        script.remove();
        reject(new Error("Thingtime login loaded without its login API"));
      }
    };
    const handleError = () => {
      cleanup();
      script.remove();
      reject(new Error("Thingtime login could not be loaded"));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    if (!existing) {
      script.async = true;
      script.dataset.pokeworldThingtimeLogin = "";
      script.src = THINGTIME_SDK_SRC;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    sdkPromise = undefined;
    throw error;
  });

  return sdkPromise;
}
