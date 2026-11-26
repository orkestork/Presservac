"use client";
import { useEffect, useRef, useState } from "react";

// Formulario de entrega: quién recibe, firma en pantalla y fotos. Lo usan el conductor
// (enlace sin sesión) y logística (transportadora / cliente recoge).

/** Reduce la foto a JPEG ~1600 px para que suba rápido desde el celular. */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function SignaturePad({ onChange }: { onChange: (has: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#051C46";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (empty) { setEmpty(false); onChange(true); }
  };
  const clear = () => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    setEmpty(true);
    onChange(false);
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={ref}
          data-signature
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
          className="h-44 w-full touch-none rounded-xl border-2 border-dashed border-[#CBD5E1] bg-white"
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#94A3B8]">Firma aquí con el dedo</span>}
      </div>
      {!empty && <button type="button" onClick={clear} className="mt-1 text-xs font-bold text-[#64748B]">Borrar firma</button>}
    </div>
  );
}

export function DeliveryForm({
  endpoint, withLocation, onDone, submitLabel = "Confirmar entrega",
}: { endpoint: string; withLocation?: boolean; onDone: () => void; submitLabel?: string }) {
  const [receiverName, setReceiverName] = useState("");
  const [receiverDoc, setReceiverDoc] = useState("");
  const [notes, setNotes] = useState("");
  const [hasSig, setHasSig] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const addPhotos = async (list: FileList | null) => {
    if (!list) return;
    const files = await Promise.all(Array.from(list).slice(0, 6 - photos.length).map(shrink));
    setPhotos((p) => [...p, ...files].slice(0, 6));
    setPreviews((p) => [...p, ...files.map((f) => URL.createObjectURL(f))].slice(0, 6));
  };
  const removePhoto = (i: number) => {
    setPhotos((p) => p.filter((_, j) => j !== i));
    setPreviews((p) => p.filter((_, j) => j !== i));
  };

  const location = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!withLocation || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 6000, maximumAge: 60000 },
      );
    });

  const submit = async () => {
    if (!receiverName.trim()) { setError("Escribe el nombre de quien recibe"); return; }
    if (!hasSig && photos.length === 0) { setError("Falta la firma o al menos una foto"); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("receiverName", receiverName);
      fd.append("receiverDoc", receiverDoc);
      fd.append("notes", notes);
      if (hasSig) {
        const canvas = wrap.current?.querySelector<HTMLCanvasElement>("canvas[data-signature]");
        const blob: Blob | null = canvas ? await new Promise((r) => canvas.toBlob(r, "image/png")) : null;
        if (blob) fd.append("signature", new File([blob], "firma.png", { type: "image/png" }));
      }
      photos.forEach((f) => fd.append("photos", f));
      const loc = await location();
      if (loc) { fd.append("lat", String(loc.lat)); fd.append("lng", String(loc.lng)); }
      const r = await fetch(endpoint, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "No se pudo guardar; revisa la señal e intenta otra vez"); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-base outline-none focus:border-[#051C46]";
  return (
    <div ref={wrap} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-[#334155]">¿Quién recibe?
          <input className={`${input} mt-1`} value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Nombre completo" autoComplete="off" />
        </label>
        <label className="block text-sm font-semibold text-[#334155]">Cédula (opcional)
          <input className={`${input} mt-1`} inputMode="numeric" value={receiverDoc} onChange={(e) => setReceiverDoc(e.target.value)} />
        </label>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-[#334155]">Firma de quien recibe</p>
        <SignaturePad onChange={setHasSig} />
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-[#334155]">Fotos (remisión firmada, mercancía entregada…)</p>
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative h-20 w-20 overflow-hidden rounded-xl border border-[#E2E8F0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => removePhoto(i)} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white">×</button>
            </div>
          ))}
          {photos.length < 6 && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#CBD5E1] text-xs font-bold text-[#64748B]">
              <span className="text-2xl leading-none">+</span>Foto
              <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>
      <label className="block text-sm font-semibold text-[#334155]">Observaciones (opcional)
        <input className={`${input} mt-1`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. recibió el almacenista, 2 cajas" />
      </label>
      {error && <p className="rounded-xl bg-[#FEE2E2] px-3 py-2 text-sm font-semibold text-[#DC2626]">{error}</p>}
      <button type="button" disabled={busy} onClick={submit} className="w-full rounded-2xl bg-[#16A34A] py-4 text-lg font-black text-white shadow-lg disabled:opacity-60">
        {busy ? "Enviando…" : submitLabel}
      </button>
    </div>
  );
}
