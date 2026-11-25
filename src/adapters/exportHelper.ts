interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      Filesystem?: {
        writeFile: (opts: {
          path: string;
          data: string;
          directory: string;
          encoding?: string;
        }) => Promise<{ uri: string }>;
      };
      Share?: {
        share: (opts: {
          title?: string;
          text?: string;
          url?: string;
          dialogTitle?: string;
        }) => Promise<void>;
      };
    };
  };
}

export interface ExportResult {
  ok: boolean;
  method: 'capacitor' | 'web';
  filename: string;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function exportFileCrossPlatform(
  filename: string,
  content: string | Uint8Array,
  mimeType: string,
  shareTitle = 'SurveyCAD Export'
): Promise<ExportResult> {
  const capWin = typeof window !== 'undefined' ? (window as CapacitorWindow) : undefined;
  const cap = capWin?.Capacitor;
  const isNative = Boolean(cap?.isNativePlatform?.());

  if (isNative && cap?.Plugins?.Filesystem && cap?.Plugins?.Share) {
    const isBinary = content instanceof Uint8Array;
    const data = isBinary
      ? uint8ToBase64(content)
      : uint8ToBase64(new TextEncoder().encode(content));
    const writeRes = await cap.Plugins.Filesystem.writeFile({
      path: filename,
      data,
      directory: 'CACHE',
    });
    await cap.Plugins.Share.share({
      title: shareTitle,
      url: writeRes.uri,
      dialogTitle: shareTitle,
    });
    return { ok: true, method: 'capacitor', filename };
  }

  // Browser download fallback
  const blobPart: BlobPart =
    content instanceof Uint8Array
      ? new Uint8Array(content)
      : content;
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1500);

  return { ok: true, method: 'web', filename };
}
